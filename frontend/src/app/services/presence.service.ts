import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import '@tensorflow/tfjs-backend-webgl';
import * as blazeface from '@tensorflow-models/blazeface';

type Status = 'off' | 'starting' | 'running' | 'no-camera' | 'denied';

const TICK_MS = 1000;
const DETECT_MS = 1500;
const HEARTBEAT_MS = 30000;
const MODEL_RETRIES = 2;
const LEADER_KEY = 'sc_presence_leader';
const LEADER_TTL_MS = 6000;

/**
 * Monitoreo de presencia por cámara + actividad, 100% en el dispositivo.
 * Nunca sube imágenes ni video: solo envía segundos acumulados al backend.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private http = inject(HttpClient);

  readonly status = signal<Status>('off');
  readonly faceDetected = signal(false);
  readonly cameraOn = signal(false);

  private readonly tabId = Math.random().toString(36).slice(2);
  private video?: HTMLVideoElement;
  private stream?: MediaStream;
  private model?: blazeface.BlazeFaceModel;

  // Acumulación en milisegundos (robusta ante el throttling de pestañas en 2º plano).
  private presentMs = 0;
  private absentMs = 0;
  private lastAccountAt = Date.now();

  private tickTimer?: ReturnType<typeof setInterval>;
  private detectTimer?: ReturnType<typeof setInterval>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private leaderTimer?: ReturnType<typeof setInterval>;
  private detectInFlight = false;
  private started = false;

  private readonly flushOnHide = () => {
    if (document.visibilityState === 'hidden') this.flush(true);
  };

  /** Solicita el permiso de cámara y arranca el monitoreo (sin pantalla de consentimiento). */
  init(): void {
    this.start();
  }

  // ---------------------------------------------------------------

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.status.set('starting');
    this.lastAccountAt = Date.now();

    document.addEventListener('visibilitychange', this.flushOnHide);
    window.addEventListener('beforeunload', () => this.flush(true));

    // Elección de líder (para no contar doble con varias pestañas).
    this.leaderTimer = setInterval(() => this.maintainLeadership(), 2000);
    this.maintainLeadership();

    this.initCamera();

    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.heartbeatTimer = setInterval(() => this.flush(false), HEARTBEAT_MS);
  }

  private stop(): void {
    this.started = false;
    this.flush(true);
    for (const t of [this.tickTimer, this.detectTimer, this.heartbeatTimer, this.leaderTimer]) {
      if (t) clearInterval(t);
    }
    this.tickTimer = this.detectTimer = this.heartbeatTimer = this.leaderTimer = undefined;
    document.removeEventListener('visibilitychange', this.flushOnHide);
    this.releaseCamera();
    this.releaseLeadership();
    this.cameraOn.set(false);
    this.faceDetected.set(false);
    this.status.set('off');
  }

  private async initCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });
      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = this.stream;
      await this.video.play();
      // Encendemos el flag al obtener stream para reflejar que la cámara sí abrió.
      this.cameraOn.set(true);
      this.model = await this.loadModelWithRetry();
      this.status.set('running');
      void this.detect();
      this.detectTimer = setInterval(() => this.detect(), DETECT_MS);
    } catch (err) {
      // Si falla la carga del modelo, cerramos la cámara para no dejarla "encendida" sin monitoreo.
      this.releaseCamera();
      const errorName = (err as DOMException)?.name;
      const denied = errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError';
      this.status.set(denied ? 'denied' : 'no-camera');
    }
  }

  private async loadModelWithRetry(): Promise<blazeface.BlazeFaceModel> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MODEL_RETRIES; attempt++) {
      try {
        return await blazeface.load();
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error('No se pudo cargar el modelo de detección facial');
  }

  private async detect(): Promise<void> {
    if (this.detectInFlight || !this.model || !this.video || this.video.readyState < 2) return;
    this.detectInFlight = true;
    try {
      const preds = await this.model.estimateFaces(this.video, false);
      this.faceDetected.set(preds.length > 0);
    } catch {
      this.faceDetected.set(false);
    } finally {
      this.detectInFlight = false;
    }
  }

  private releaseCamera(): void {
    this.detectTimer && clearInterval(this.detectTimer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.video) {
      this.video.srcObject = null;
      this.video = undefined;
    }
    this.model = undefined;
    this.detectInFlight = false;
    this.cameraOn.set(false);
  }

  /** Atribuye el tiempo transcurrido a presente/ausente según el rostro. Solo el líder cuenta. */
  private tick(): void {
    const now = Date.now();
    const elapsed = now - this.lastAccountAt;
    this.lastAccountAt = now;
    if (!this.isLeader() || !this.cameraOn() || elapsed <= 0) return;

    if (this.faceDetected()) {
      this.presentMs += elapsed;
    } else {
      this.absentMs += elapsed;
    }
  }

  private flush(final: boolean): void {
    const present = Math.round(this.presentMs / 1000);
    const absent = Math.round(this.absentMs / 1000);
    if (present === 0 && absent === 0) return;
    this.presentMs -= present * 1000;
    this.absentMs -= absent * 1000;
    const body = { present_delta: present, absent_delta: absent };

    if (final && 'fetch' in window) {
      // Envío best-effort al cerrar la pestaña.
      const token = localStorage.getItem('sc_tools_token');
      fetch('/api/presence/heartbeat', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(body),
      }).catch(() => void 0);
      return;
    }

    this.http.post('/api/presence/heartbeat', body).subscribe({ error: () => void 0 });
  }

  // ---- Elección de líder entre pestañas (localStorage) ----
  private maintainLeadership(): void {
    const now = Date.now();
    const raw = localStorage.getItem(LEADER_KEY);
    let leader: { id: string; ts: number } | null = null;
    try {
      leader = raw ? JSON.parse(raw) : null;
    } catch {
      leader = null;
    }
    if (!leader || now - leader.ts > LEADER_TTL_MS || leader.id === this.tabId) {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: this.tabId, ts: now }));
    }
  }

  private isLeader(): boolean {
    try {
      const leader = JSON.parse(localStorage.getItem(LEADER_KEY) || 'null');
      return leader?.id === this.tabId;
    } catch {
      return false;
    }
  }

  private releaseLeadership(): void {
    try {
      const leader = JSON.parse(localStorage.getItem(LEADER_KEY) || 'null');
      if (leader?.id === this.tabId) localStorage.removeItem(LEADER_KEY);
    } catch {
      /* noop */
    }
  }
}
