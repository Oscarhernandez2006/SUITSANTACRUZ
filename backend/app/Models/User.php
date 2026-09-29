<?php

namespace App\Models;

use App\Support\SuitePermissions;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'cedula', 'email', 'password', 'is_active', 'is_admin', 'role_id', 'presence_consent_at', 'face_descriptor', 'face_enrolled_at', 'face_bypass_until'])]
#[Hidden(['password', 'remember_token', 'face_descriptor'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function loginLogs()
    {
        return $this->hasMany(LoginLog::class);
    }

    public function applications(): BelongsToMany
    {
        return $this->belongsToMany(Application::class)
            ->withPivot('abilities', 'app_role', 'app_permissions')
            ->withTimestamps();
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /** Acceso total a la Suite: admin directo o por su grupo. */
    public function hasFullSuiteAccess(): bool
    {
        return (bool) $this->is_admin || (bool) $this->role?->is_admin;
    }

    /** Permisos efectivos sobre los módulos propios de la Suite. */
    public function suitePermissions(): array
    {
        if ($this->hasFullSuiteAccess()) {
            return SuitePermissions::all();
        }

        return SuitePermissions::normalize((array) ($this->role?->permissions ?? []));
    }

    /** ¿Tiene al menos uno de los permisos indicados? */
    public function canSuite(string ...$permissions): bool
    {
        return (bool) array_intersect($permissions, $this->suitePermissions());
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'is_admin' => 'boolean',
            'presence_consent_at' => 'datetime',
            'face_descriptor' => 'array',
            'face_enrolled_at' => 'datetime',
            'face_bypass_until' => 'datetime',
        ];
    }
}
