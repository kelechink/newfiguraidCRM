<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// v2: email campaigns (Seyi/Brevo), social posts (Zara), calendar feeds, CDR imports.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaigns', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('name');
            $t->text('brief')->nullable(); // what Seyi should write
            $t->string('subject')->nullable();
            $t->longText('body')->nullable(); // plain text / light markdown
            $t->json('audience'); // {units:[], tags:[], lifecycle:[]}
            $t->string('status', 16)->default('draft'); // draft pending_approval approved sending sent cancelled
            $t->unsignedInteger('recipients')->default(0);
            $t->unsignedInteger('sent_count')->default(0);
            $t->unsignedInteger('failed_count')->default(0);
            $t->foreignUlid('created_by_id')->constrained('users');
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users');
            $t->timestamp('scheduled_at')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamps();
        });
        Schema::create('campaign_recipients', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('campaign_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $t->string('status', 10)->default('queued'); // queued sent failed skipped
            $t->string('error')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->unique(['campaign_id', 'contact_id']);
        });
        Schema::create('social_posts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('platform', 10); // facebook instagram linkedin x
            $t->text('body');
            $t->foreignUlid('image_file_id')->nullable()->constrained('stored_files')->nullOnDelete();
            $t->string('image_url')->nullable(); // public URL needed by Instagram
            $t->timestamp('scheduled_at')->nullable()->index();
            $t->string('status', 16)->default('draft'); // draft pending_approval approved published failed
            $t->string('agent_key', 20)->nullable();
            $t->foreignUlid('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('external_id')->nullable();
            $t->string('error')->nullable();
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
        });
        Schema::table('users', fn (Blueprint $t) => $t->string('calendar_token', 48)->nullable()->unique());
        Schema::create('cdr_imports', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained();
            $t->foreignUlid('file_id')->nullable()->constrained('stored_files')->nullOnDelete();
            $t->unsignedInteger('calls')->default(0);
            $t->decimal('billed_minutes', 14, 4)->default(0);
            $t->unsignedInteger('unrated')->default(0);
            $t->json('errors')->nullable();
            $t->foreignUlid('uploaded_by_id')->constrained('users');
            $t->timestamps();
        });
        Schema::table('traffic_entries', fn (Blueprint $t) => $t->foreignUlid('cdr_import_id')->nullable()->constrained()->nullOnDelete());
    }

    public function down(): void
    {
        Schema::table('traffic_entries', fn (Blueprint $t) => $t->dropConstrainedForeignId('cdr_import_id'));
        Schema::dropIfExists('cdr_imports');
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('calendar_token'));
        foreach (['social_posts', 'campaign_recipients', 'campaigns'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
