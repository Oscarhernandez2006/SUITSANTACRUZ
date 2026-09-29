<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Última vez que la cámara detectó a la persona (last_seen_at cuenta también ausencias). */
    public function up(): void
    {
        Schema::table('presence_days', function (Blueprint $table) {
            $table->timestamp('last_present_at')->nullable()->after('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::table('presence_days', function (Blueprint $table) {
            $table->dropColumn('last_present_at');
        });
    }
};
