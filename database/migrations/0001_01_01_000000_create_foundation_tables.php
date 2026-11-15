<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Foundation: business units, people, roles and permissions, sessions, audit, settings, files.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_units', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('code', 20)->unique(); // TELECOM, FIGUREWEB, ACADEMY, PROCUREMENT, HQ
            $t->string('name');
            $t->string('accent', 9)->default('#4cc9ff');
            $t->string('website')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('roles', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('key', 40)->unique();
            $t->string('name');
            $t->text('description')->nullable();
            $t->boolean('requires_2fa')->default(false);
            $t->boolean('is_system')->default(false);
            $t->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('role_id')->constrained()->cascadeOnDelete();
            $t->string('module', 60);
            $t->string('action', 10); // view create edit delete approve export
            $t->string('scope', 4); // own unit all
            $t->unique(['role_id', 'module', 'action']);
        });

        Schema::create('users', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('email')->unique();
            $t->string('phone', 40)->nullable();
            $t->timestamp('email_verified_at')->nullable();
            $t->string('password');
            $t->string('status', 12)->default('invited'); // invited onboarding active suspended exited
            $t->foreignUlid('role_id')->constrained();
            $t->foreignUlid('primary_unit_id')->nullable()->constrained('business_units');
            $t->string('avatar_path')->nullable();
            $t->text('app_authentication_secret')->nullable(); // encrypted cast
            $t->text('app_authentication_recovery_codes')->nullable(); // encrypted cast
            $t->json('ip_allowlist')->nullable(); // optional per-user allowlist (admin/finance)
            $t->string('quiet_hours', 11)->nullable(); // "22:00-07:00"
            $t->date('birthday')->nullable();
            $t->unsignedInteger('failed_logins')->default(0);
            $t->timestamp('locked_until')->nullable();
            $t->timestamp('last_login_at')->nullable();
            $t->string('last_login_ip', 45)->nullable();
            $t->timestamp('password_changed_at')->nullable();
            $t->timestamp('access_expires_at')->nullable(); // auditors
            $t->timestamp('contract_signed_at')->nullable();
            $t->string('privacy_policy_version', 20)->nullable();
            $t->rememberToken();
            $t->timestamps();
        });

        Schema::create('business_unit_user', function (Blueprint $t) {
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('business_unit_id')->constrained()->cascadeOnDelete();
            $t->primary(['user_id', 'business_unit_id']);
        });

        Schema::create('user_grants', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('module', 60);
            $t->string('action', 10);
            $t->string('scope', 4);
            $t->timestamp('expires_at')->nullable();
            $t->string('reason')->nullable();
            $t->foreignUlid('granted_by_id')->constrained('users');
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $t) {
            $t->string('email')->primary();
            $t->string('token');
            $t->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->foreignUlid('user_id')->nullable()->index();
            $t->string('ip_address', 45)->nullable();
            $t->text('user_agent')->nullable();
            $t->longText('payload');
            $t->integer('last_activity')->index();
        });

        Schema::create('login_events', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('user_id')->nullable()->index();
            $t->string('email')->nullable();
            $t->string('event', 20); // success failed locked new_device logout
            $t->string('ip', 45)->nullable();
            $t->string('user_agent', 300)->nullable();
            $t->timestamp('at')->useCurrent()->index();
        });

        Schema::create('known_devices', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->char('fingerprint', 64); // sha256 of user agent + ip /24
            $t->timestamp('first_seen_at')->useCurrent();
            $t->timestamp('last_seen_at')->useCurrent();
            $t->unique(['user_id', 'fingerprint']);
        });

        // Append-only, hash-chained (enforced in the model; verified by `php artisan audit:verify`).
        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->timestamp('at', 6)->index();
            $t->foreignUlid('actor_id')->nullable()->index();
            $t->string('actor_type', 12)->default('user'); // user system webhook ai external
            $t->string('action', 80)->index();
            $t->string('entity_type', 80)->nullable();
            $t->string('entity_id', 40)->nullable();
            $t->foreignUlid('unit_id')->nullable();
            $t->json('before')->nullable();
            $t->json('after')->nullable();
            $t->string('ip', 45)->nullable();
            $t->char('prev_hash', 64)->nullable();
            $t->char('hash', 64);
            $t->index(['entity_type', 'entity_id']);
        });
        Schema::create('audit_head', function (Blueprint $t) {
            $t->unsignedTinyInteger('id')->primary();
            $t->char('hash', 64)->nullable();
        });

        Schema::create('settings', function (Blueprint $t) {
            $t->string('key', 80)->primary();
            $t->json('value');
            $t->timestamps();
        });

        Schema::create('stored_files', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('disk', 20)->default('private');
            $t->string('path');
            $t->string('original_name');
            $t->string('mime', 100);
            $t->unsignedBigInteger('size');
            $t->char('sha256', 64);
            $t->string('purpose', 30);
            $t->foreignUlid('uploaded_by_id')->nullable();
            $t->timestamps();
        });

        Schema::create('public_holidays', function (Blueprint $t) {
            $t->id();
            $t->date('date')->unique();
            $t->string('name');
        });
    }

    public function down(): void
    {
        foreach (['public_holidays', 'stored_files', 'settings', 'audit_head', 'audit_logs', 'known_devices', 'login_events', 'sessions', 'password_reset_tokens', 'user_grants', 'business_unit_user', 'users', 'role_permissions', 'roles', 'business_units'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
