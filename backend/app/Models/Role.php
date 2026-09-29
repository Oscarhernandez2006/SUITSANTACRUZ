<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    /** Grupos base que no se pueden eliminar. */
    public const SYSTEM_SLUGS = ['administrador', 'normal'];

    protected $fillable = ['name', 'slug', 'description', 'color', 'is_admin', 'app_ids', 'abilities', 'permissions'];

    protected function casts(): array
    {
        return [
            'is_admin' => 'boolean',
            'app_ids' => 'array',
            'abilities' => 'array',
            'permissions' => 'array',
        ];
    }

    public function isSystem(): bool
    {
        return in_array($this->slug, self::SYSTEM_SLUGS, true);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
