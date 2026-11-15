<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Telecom (carriers, rates, traffic, fraud) and finance (invoices, payments, expenses, bank, FX, tax, debts).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carriers', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('role', 9)->default('customer'); // customer vendor both
            $t->string('country', 80)->nullable();
            $t->string('currency', 3)->default('USD');
            $t->string('billing_cycle', 4)->default('7/3'); // 7/3 7/4 30/15
            $t->unsignedTinyInteger('increment_first')->default(60);
            $t->unsignedTinyInteger('increment_next')->default(60);
            $t->decimal('credit_limit', 18, 2)->default(0);
            $t->decimal('prepaid_balance', 18, 2)->default(0);
            $t->string('kyc_status', 10)->default('pending'); // pending verified rejected
            $t->string('status', 10)->default('testing'); // testing active suspended closed
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('account_manager_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('rate_email')->nullable(); // vendor rate-sheet sender
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });
        Schema::create('carrier_contacts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('role', 30)->nullable(); // noc billing rates commercial
            $t->string('email')->nullable();
            $t->string('phone', 40)->nullable();
            $t->string('teams_handle')->nullable();
            $t->timestamps();
        });
        Schema::create('carrier_documents', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 30); // incorporation licence director_id agreement tax other
            $t->foreignUlid('file_id')->constrained('stored_files');
            $t->date('expires_on')->nullable();
            $t->string('status', 10)->default('pending');
            $t->timestamps();
        });

        Schema::create('rate_decks', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->string('direction', 4); // buy sell
            $t->string('name');
            $t->string('currency', 3)->default('USD');
            $t->date('effective_from');
            $t->string('source', 10)->default('upload'); // upload email builder
            $t->foreignUlid('file_id')->nullable()->constrained('stored_files')->nullOnDelete();
            $t->string('status', 10)->default('draft'); // draft active superseded blocked
            $t->json('validation')->nullable(); // below-cost / min margin findings
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamps();
        });
        Schema::create('rates', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('rate_deck_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->string('direction', 4);
            $t->string('destination', 120);
            $t->string('prefix', 16)->index();
            $t->decimal('rate', 12, 6); // per minute
            $t->string('currency', 3);
            $t->date('effective_from');
            $t->date('effective_to')->nullable();
            $t->unsignedTinyInteger('increment_first')->default(60);
            $t->unsignedTinyInteger('increment_next')->default(60);
            $t->index(['carrier_id', 'direction', 'prefix', 'effective_from']);
        });
        Schema::create('margin_rules', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('service', 20)->default('voice'); // voice sms numbers
            $t->string('prefix', 16)->nullable(); // null = default
            $t->decimal('min_margin_pct', 6, 2)->default(5);
            $t->decimal('target_margin_pct', 6, 2)->default(10);
            $t->timestamps();
        });
        Schema::create('traffic_entries', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->date('date');
            $t->foreignUlid('customer_carrier_id')->constrained('carriers');
            $t->foreignUlid('vendor_carrier_id')->nullable()->constrained('carriers');
            $t->string('destination', 120);
            $t->string('prefix', 16)->nullable();
            $t->decimal('minutes', 14, 2);
            $t->unsignedInteger('attempts')->nullable();
            $t->unsignedInteger('connected')->nullable();
            $t->decimal('sell_rate', 12, 6)->nullable();
            $t->decimal('buy_rate', 12, 6)->nullable();
            $t->string('currency', 3)->default('USD');
            $t->decimal('revenue', 18, 4)->default(0);
            $t->decimal('cost', 18, 4)->default(0);
            $t->string('source', 10)->default('manual'); // manual cdr
            $t->foreignUlid('entered_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['date', 'customer_carrier_id']);
        });
        Schema::create('fraud_alerts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('kind', 20); // spike unusual_destination asr_drop acd_drop credit
            $t->string('severity', 8)->default('warning');
            $t->string('summary');
            $t->json('data')->nullable();
            $t->string('status', 10)->default('open'); // open acknowledged resolved
            $t->foreignUlid('handled_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('route_broadcasts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('subject');
            $t->text('body');
            $t->foreignUlid('rate_deck_id')->nullable()->constrained()->nullOnDelete();
            $t->json('recipient_carrier_ids');
            $t->string('status', 10)->default('draft'); // draft approved sent
            $t->foreignUlid('created_by_id')->constrained('users');
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users');
            $t->timestamp('sent_at')->nullable();
            $t->timestamps();
        });
        Schema::create('disputes', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained();
            $t->ulid('invoice_id')->nullable();
            $t->string('period', 30);
            $t->decimal('our_amount', 18, 2);
            $t->decimal('their_amount', 18, 2);
            $t->string('currency', 3);
            $t->text('notes')->nullable();
            $t->string('status', 10)->default('open');
            $t->timestamps();
        });

        Schema::create('fx_rates', function (Blueprint $t) {
            $t->id();
            $t->string('currency', 3);
            $t->date('date');
            $t->decimal('ngn_per_unit', 14, 4);
            $t->string('basis', 10)->default('parallel'); // parallel official manual
            $t->json('sources')->nullable();
            $t->string('status', 10)->default('accepted'); // accepted needs_review
            $t->timestamps();
            $t->unique(['currency', 'date', 'basis']);
        });

        Schema::create('invoices', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('number', 30)->unique();
            $t->string('kind', 8)->default('invoice'); // invoice quote credit
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('carrier_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('deal_id')->nullable()->constrained()->nullOnDelete();
            $t->string('currency', 3)->default('NGN');
            $t->decimal('fx_rate', 14, 4)->default(1); // NGN per unit on issue date (stored)
            $t->date('issue_date');
            $t->date('due_date');
            $t->decimal('subtotal', 18, 2)->default(0);
            $t->decimal('vat', 18, 2)->default(0);
            $t->decimal('wht', 18, 2)->default(0);
            $t->decimal('total', 18, 2)->default(0);
            $t->decimal('amount_paid', 18, 2)->default(0);
            $t->string('status', 10)->default('draft'); // draft sent part_paid paid overdue void accepted
            $t->string('external_ref', 60)->nullable()->index(); // WHMCS invoice id
            $t->text('notes')->nullable();
            $t->string('signature_name')->nullable(); // quote e-signature
            $t->timestamp('signed_at')->nullable();
            $t->string('signed_ip', 45)->nullable();
            $t->string('public_token', 40)->nullable()->unique();
            $t->unsignedTinyInteger('dunning_level')->default(0);
            $t->foreignUlid('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();
            $t->index(['status', 'due_date']);
        });
        Schema::create('invoice_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('invoice_id')->constrained()->cascadeOnDelete();
            $t->string('description');
            $t->decimal('quantity', 14, 2)->default(1);
            $t->decimal('unit_price', 18, 4);
            $t->decimal('cost_price', 18, 4)->nullable(); // procurement margin
            $t->boolean('vatable')->default(true);
            $t->decimal('amount', 18, 2);
        });

        Schema::create('payments', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->foreignUlid('invoice_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->string('gateway', 12); // paystack flutterwave bank cash whmcs
            $t->string('reference', 120);
            $t->decimal('amount', 18, 2);
            $t->string('currency', 3)->default('NGN');
            $t->decimal('amount_ngn', 18, 2);
            $t->timestamp('paid_at');
            $t->string('status', 10)->default('confirmed'); // confirmed pending failed refunded
            $t->boolean('verified_with_gateway')->default(false);
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->unique(['gateway', 'reference']);
        });
        Schema::create('webhook_events', function (Blueprint $t) { // replay protection
            $t->id();
            $t->string('provider', 20);
            $t->string('event_id', 120);
            $t->timestamp('received_at')->useCurrent();
            $t->unique(['provider', 'event_id']);
        });

        Schema::create('bank_accounts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('bank');
            $t->text('account_number'); // encrypted
            $t->string('currency', 3)->default('NGN');
            $t->decimal('opening_balance', 18, 2)->default(0);
            $t->timestamps();
        });
        Schema::create('bank_transactions', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('bank_account_id')->constrained()->cascadeOnDelete();
            $t->date('date');
            $t->string('description', 500);
            $t->decimal('amount', 18, 2); // + credit, - debit
            $t->string('reference', 120)->nullable();
            $t->char('hash', 64)->unique(); // dedupe re-uploads
            $t->string('match_status', 10)->default('unmatched'); // unmatched suggested matched ignored
            $t->foreignUlid('payment_id')->nullable()->constrained()->nullOnDelete();
            $t->ulid('suggested_invoice_id')->nullable();
            $t->unsignedTinyInteger('match_confidence')->nullable();
            $t->foreignUlid('expense_id')->nullable();
            $t->timestamps();
        });

        Schema::create('expense_categories', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->string('tax_code', 20)->nullable();
        });
        Schema::create('vendors', function (Blueprint $t) { // suppliers & service providers
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('kind', 12)->default('service'); // service supplier telecom landlord
            $t->string('email')->nullable();
            $t->string('phone', 40)->nullable();
            $t->string('currency', 3)->default('NGN');
            $t->json('categories')->nullable();
            $t->unsignedTinyInteger('rating')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('expenses', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->foreignId('category_id')->nullable()->constrained('expense_categories');
            $t->foreignUlid('vendor_id')->nullable()->constrained()->nullOnDelete();
            $t->string('description');
            $t->decimal('amount', 18, 2);
            $t->string('currency', 3)->default('NGN');
            $t->decimal('fx_rate', 14, 4)->default(1);
            $t->decimal('amount_ngn', 18, 2);
            $t->decimal('vat', 18, 2)->default(0);
            $t->decimal('wht', 18, 2)->default(0);
            $t->date('date');
            $t->date('due_date')->nullable(); // payables
            $t->string('status', 10)->default('requested'); // requested approved rejected paid
            $t->foreignUlid('receipt_file_id')->nullable()->constrained('stored_files')->nullOnDelete();
            $t->foreignUlid('requested_by_id')->constrained('users');
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users');
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->timestamps();
            $t->index(['status', 'date']);
        });

        Schema::create('subscriptions', function (Blueprint $t) { // customer services + Figuraid's own tools
            $t->ulid('id')->primary();
            $t->string('side', 8); // customer own
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('vendor_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name');
            $t->string('kind', 12)->default('hosting'); // hosting domain software licence telecom other
            $t->decimal('amount', 18, 2);
            $t->string('currency', 3)->default('NGN');
            $t->string('cycle', 10)->default('monthly'); // monthly quarterly annually biennially
            $t->date('next_due_on')->index();
            $t->string('status', 10)->default('active'); // active pending cancelled expired
            $t->boolean('auto_renew')->default(true);
            $t->string('external_ref', 60)->nullable(); // WHMCS service/domain id
            $t->json('reminders_sent')->nullable(); // [30,14,7,1]
            $t->timestamps();
        });

        Schema::create('debts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('lender');
            $t->string('kind', 12)->default('loan');
            $t->decimal('principal', 18, 2);
            $t->decimal('outstanding', 18, 2);
            $t->string('currency', 3)->default('NGN');
            $t->decimal('interest_rate_pct', 6, 2)->default(0);
            $t->date('start_date');
            $t->date('end_date')->nullable();
            $t->decimal('instalment', 18, 2)->nullable();
            $t->string('frequency', 10)->default('monthly');
            $t->date('next_payment_on')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('debt_payments', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('debt_id')->constrained()->cascadeOnDelete();
            $t->date('date');
            $t->decimal('amount', 18, 2);
            $t->decimal('interest_portion', 18, 2)->default(0);
            $t->timestamps();
        });

        Schema::create('tax_records', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('kind', 10); // vat wht paye pension
            $t->string('period_month', 7);
            $t->decimal('amount', 18, 2);
            $t->string('direction', 10); // payable receivable
            $t->string('status', 10)->default('open'); // open filed paid
            $t->string('reference')->nullable();
            $t->timestamps();
            $t->unique(['kind', 'period_month', 'direction']);
        });
    }

    public function down(): void
    {
        foreach (['tax_records', 'debt_payments', 'debts', 'subscriptions', 'expenses', 'vendors', 'expense_categories', 'bank_transactions', 'bank_accounts', 'webhook_events', 'payments', 'invoice_lines', 'invoices', 'fx_rates', 'disputes', 'route_broadcasts', 'fraud_alerts', 'traffic_entries', 'margin_rules', 'rates', 'rate_decks', 'carrier_documents', 'carrier_contacts', 'carriers'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
