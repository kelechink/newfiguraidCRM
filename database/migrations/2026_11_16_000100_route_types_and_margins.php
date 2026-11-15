<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

// v2: voice routes are priced per route type (TDM, CC, CLI); SMS has no fixed minimum margin.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rate_decks', fn (Blueprint $t) => $t->string('route_type', 6)->default('cli')->after('direction')); // tdm cc cli sms
        Schema::table('rates', function (Blueprint $t) {
            $t->string('route_type', 6)->default('cli')->after('direction');
            $t->index(['route_type', 'direction', 'prefix']);
        });
        Schema::table('margin_rules', function (Blueprint $t) {
            $t->decimal('min_margin_pct', 6, 2)->nullable()->default(null)->change();
            $t->decimal('target_margin_pct', 6, 2)->nullable()->default(null)->change();
        });
        Schema::table('route_broadcasts', fn (Blueprint $t) => $t->json('send_log')->nullable());

        DB::table('margin_rules')->where('service', 'voice')->whereNull('prefix')->delete();
        DB::table('margin_rules')->where('service', 'sms')->whereNull('prefix')->update(['min_margin_pct' => null, 'target_margin_pct' => null]);
        foreach (['tdm', 'cc', 'cli'] as $type) {
            if (! DB::table('margin_rules')->where('service', $type)->whereNull('prefix')->exists()) {
                DB::table('margin_rules')->insert(['id' => (string) Str::ulid(), 'service' => $type, 'prefix' => null, 'min_margin_pct' => 4, 'target_margin_pct' => 8, 'created_at' => now(), 'updated_at' => now()]);
            }
        }
        if (! DB::table('margin_rules')->where('service', 'sms')->whereNull('prefix')->exists()) {
            DB::table('margin_rules')->insert(['id' => (string) Str::ulid(), 'service' => 'sms', 'prefix' => null, 'min_margin_pct' => null, 'target_margin_pct' => null, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::table('route_broadcasts', fn (Blueprint $t) => $t->dropColumn('send_log'));
        Schema::table('rates', function (Blueprint $t) {
            $t->dropIndex(['route_type', 'direction', 'prefix']);
            $t->dropColumn('route_type');
        });
        Schema::table('rate_decks', fn (Blueprint $t) => $t->dropColumn('route_type'));
    }
};
