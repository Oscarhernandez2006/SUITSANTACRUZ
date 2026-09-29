<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PresenceDay extends Model
{
    /** El "día" de presencia se corta en hora de Colombia (la app corre en UTC). */
    public const TZ = 'America/Bogota';

    protected $fillable = [
        'user_id', 'date', 'present_seconds', 'absent_seconds',
        'samples', 'first_seen_at', 'last_seen_at', 'last_present_at',
    ];

    public static function today(): string
    {
        return now(self::TZ)->toDateString();
    }

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'present_seconds' => 'integer',
            'absent_seconds' => 'integer',
            'samples' => 'integer',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'last_present_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
