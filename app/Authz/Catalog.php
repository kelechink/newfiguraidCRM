<?php

namespace App\Authz;

/**
 * Permission catalogue: module × action × scope. Which role holds what is data
 * (role_permissions / user_grants). Sensitive modules can only be granted by a Super Admin.
 */
final class Catalog
{
    public const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

    public const SCOPES = ['own', 'unit', 'all'];

    /** key => [label, group, sensitive] */
    public const MODULES = [
        'dashboard.command' => ['Command dashboard', 'Work', false],
        'dashboard.finance' => ['Admin finance dashboard', 'Money', true],
        'dashboard.today' => ['Today at a glance', 'Work', false],
        'tasks' => ['Tasks', 'Work', false],
        'playbooks' => ['Playbooks (SOPs)', 'Work', false],
        'targets' => ['Targets, OKRs & scorecards', 'Work', false],
        'reports.daily' => ['End-of-day reports', 'Work', false],
        'reports.builder' => ['Reports builder & scheduled reports', 'Work', false],
        'messaging' => ['Internal chat', 'Work', false],
        'announcements' => ['Announcements', 'Work', false],
        'attendance' => ['Attendance', 'Work', false],
        'attendance.review' => ['Attendance review & devices', 'Work', false],
        'leave' => ['Leave requests', 'Work', false],
        'training' => ['Training centre', 'Work', false],
        'kb' => ['Knowledge base', 'Work', false],
        'inbox' => ['Omnichannel inbox', 'Customers', false],
        'inbox.routing' => ['Inbox routing, SLA & AI agents', 'Customers', false],
        'crm.contacts' => ['Customers & companies', 'Customers', false],
        'crm.deals' => ['Deals & pipelines', 'Customers', false],
        'crm.forms' => ['Lead forms', 'Customers', false],
        'marketing.campaigns' => ['Campaigns & broadcasts', 'Customers', false],
        'support.tickets' => ['Support tickets', 'Customers', false],
        'academy' => ['Academy: courses, cohorts, students', 'Customers', false],
        'academy.certificates' => ['Academy certificates', 'Customers', false],
        'surveys' => ['CSAT & NPS', 'Customers', false],
        'finance.income' => ['Income & payments', 'Money', false],
        'finance.expenses' => ['Expenses & requests', 'Money', false],
        'finance.invoices' => ['Invoices & quotes', 'Money', false],
        'finance.bills' => ['Bills & payables', 'Money', false],
        'finance.bank' => ['Bank statements & reconciliation', 'Money', false],
        'finance.reports' => ['Finance reports & tax', 'Money', false],
        'finance.cashflow' => ['Cash, forecast & runway', 'Money', true],
        'finance.debts' => ['Debt tracker', 'Money', true],
        'subscriptions' => ['Subscriptions & renewals', 'Money', false],
        'procurement' => ['Procurement: RFQs, suppliers, POs', 'Money', false],
        'telecom.carriers' => ['Carriers & KYC', 'Money', false],
        'telecom.routes' => ['Routes & sell rates', 'Money', false],
        'telecom.buy_rates' => ['Vendor buy rates', 'Money', true],
        'telecom.margins' => ['Telecom margins', 'Money', true],
        'telecom.traffic' => ['Traffic, minutes & fraud alerts', 'Money', false],
        'telecom.billing' => ['Telecom invoicing & statements', 'Money', false],
        'telecom.prepaid' => ['Prepaid balances & credit', 'Money', false],
        'telecom.disputes' => ['Disputes', 'Money', false],
        'telecom.broadcasts' => ['Route broadcasts', 'Money', false],
        'hr.staff' => ['Staff records & onboarding', 'Team', false],
        'hr.contracts' => ['Contract templates & packs', 'Team', false],
        'hr.deductions' => ['Lateness & deductions', 'Team', false],
        'hr.salaries' => ['Salaries & allowances', 'Team', true],
        'hr.bank_details' => ['Bank & ID details', 'Team', true],
        'payroll' => ['Payroll runs', 'Team', true],
        'payroll.signoff' => ['Payroll sign-off', 'Team', true],
        'documents' => ['Document vault & renewals', 'Team', false],
        'ai.usage' => ['AI providers & usage', 'Admin', false],
        'monitoring' => ['Uptime monitoring', 'Admin', false],
        'settings' => ['Settings, users & integrations', 'Admin', false],
        'roles' => ['Roles & permissions', 'Admin', true],
        'audit' => ['Audit log', 'Admin', true],
        'exports' => ['Data exports', 'Admin', true],
    ];

    /** Modules a staff member can use before signing the contract pack (PRD: sign before work modules). */
    public const ONBOARDING_MODULES = ['dashboard.today', 'hr.contracts', 'training', 'kb', 'announcements'];

    public static function sensitive(string $module): bool
    {
        return self::MODULES[$module][2] ?? true;
    }

    public static function defaultRoles(): array
    {
        $ALL = self::ACTIONS;
        $V = ['view'];
        $VC = ['view', 'create'];
        $VCE = ['view', 'create', 'edit'];
        $VCED = ['view', 'create', 'edit', 'delete'];
        $VE = ['view', 'edit'];
        $VA = ['view', 'approve'];
        $base = [
            ['dashboard.today', $V, 'own'], ['attendance', $VC, 'own'], ['leave', $VC, 'own'], ['messaging', $VC, 'all'],
            ['announcements', $V, 'all'], ['hr.deductions', $V, 'own'], ['documents', $V, 'own'], ['reports.daily', $VC, 'own'],
            ['targets', $V, 'own'], ['finance.expenses', $VC, 'own'], ['training', $VC, 'own'], ['kb', $V, 'all'], ['hr.contracts', $V, 'own'],
        ];
        $own = array_merge($base, [['tasks', $VCE, 'own'], ['playbooks', $V, 'unit']]);
        $everything = fn (array $except = []) => array_map(fn ($m) => [$m, $ALL, 'all'], array_values(array_diff(array_keys(self::MODULES), $except)));

        return [
            'super_admin' => ['Super Admin', 'Everything, including finance, settings, audit log and roles.', true, $everything()],
            'admin' => ['Admin', 'Everything except role management and payroll sign-off.', true, $everything(['roles', 'payroll.signoff'])],
            'ops_manager' => ['Operations Manager', 'Every unit\'s work, pipelines, inbox SLAs, attendance and tickets. No payroll, salaries or settings.', true, array_merge($base, [
                ['dashboard.command', $V, 'all'], ['dashboard.today', $V, 'all'], ['tasks', $VCED, 'all'], ['playbooks', $VCE, 'all'], ['targets', $VCE, 'all'],
                ['reports.daily', $V, 'all'], ['reports.builder', $VCE, 'all'], ['announcements', $VC, 'all'], ['attendance', $V, 'all'], ['attendance.review', $VA, 'all'],
                ['leave', $VA, 'all'], ['inbox', $VCE, 'all'], ['inbox.routing', $VCE, 'all'], ['crm.contacts', $VCE, 'all'], ['crm.deals', $VCE, 'all'], ['crm.forms', $V, 'all'],
                ['support.tickets', $VCE, 'all'], ['academy', $V, 'all'], ['surveys', $V, 'all'], ['hr.staff', $V, 'all'], ['telecom.carriers', $V, 'all'], ['telecom.routes', $V, 'all'],
                ['telecom.traffic', $V, 'all'], ['finance.reports', $V, 'all'], ['procurement', $VCE, 'all'], ['kb', $VCE, 'all'], ['training', $VCE, 'all'], ['monitoring', $V, 'all'],
            ])],
            'finance' => ['Finance', 'All units\' finance, telecom billing, subscriptions, procurement, cash and payroll processing.', true, array_merge($own, [
                ['finance.income', $ALL, 'all'], ['finance.expenses', $ALL, 'all'], ['finance.invoices', $ALL, 'all'], ['finance.bills', $ALL, 'all'], ['finance.bank', $ALL, 'all'],
                ['finance.reports', ['view', 'export'], 'all'], ['finance.cashflow', $V, 'all'], ['subscriptions', $VCED, 'all'], ['procurement', $VCED, 'all'],
                ['telecom.carriers', $V, 'all'], ['telecom.routes', $V, 'all'], ['telecom.buy_rates', $V, 'all'], ['telecom.margins', $V, 'all'], ['telecom.traffic', $V, 'all'],
                ['telecom.billing', $ALL, 'all'], ['telecom.prepaid', $VCE, 'all'], ['telecom.disputes', $VCE, 'all'], ['hr.salaries', $V, 'all'], ['hr.bank_details', $V, 'all'],
                ['payroll', ['view', 'create', 'edit', 'approve', 'export'], 'all'], ['exports', ['create'], 'all'],
            ])],
            'hr' => ['HR', 'Onboarding, staff records, contract packs, attendance review, lateness, leave and exits. No salaries or bank details.', true, array_merge($own, [
                ['hr.staff', $VCE, 'all'], ['hr.contracts', $VCE, 'all'], ['hr.deductions', $VCE, 'all'], ['attendance', $V, 'all'], ['attendance.review', $VA, 'all'],
                ['leave', $VA, 'all'], ['documents', $VC, 'all'], ['announcements', $VC, 'all'], ['dashboard.today', $V, 'all'], ['training', $VCED, 'all'],
            ])],
            'unit_manager' => ['Unit Manager', 'Own business unit: leads, pipeline, team tasks, inbox, attendance and unit finance summary.', false, array_merge($base, [
                ['dashboard.today', $V, 'unit'], ['tasks', $VCED, 'unit'], ['playbooks', $VCE, 'unit'], ['targets', $VCE, 'unit'], ['reports.daily', $V, 'unit'],
                ['announcements', $VC, 'unit'], ['attendance', $V, 'unit'], ['attendance.review', $VA, 'unit'], ['leave', $VA, 'unit'], ['inbox', $VCE, 'unit'],
                ['crm.contacts', $VCE, 'unit'], ['crm.deals', $VCE, 'unit'], ['crm.forms', $VCE, 'unit'], ['support.tickets', $VCE, 'unit'], ['academy', $VCE, 'unit'],
                ['finance.reports', $V, 'unit'], ['finance.expenses', $VC, 'unit'], ['telecom.carriers', $V, 'unit'], ['telecom.routes', $V, 'unit'], ['telecom.traffic', $V, 'unit'],
                ['procurement', $VCE, 'unit'], ['surveys', $V, 'unit'],
            ])],
            'telecom_ops' => ['Telecom Operations', 'Carriers, routes, sell rates, minutes, disputes, broadcasts. No buy rates or margins unless granted.', false, array_merge($own, [
                ['telecom.carriers', $VCE, 'all'], ['telecom.routes', $VCE, 'all'], ['telecom.traffic', $VCE, 'all'], ['telecom.disputes', $VCE, 'all'],
                ['telecom.prepaid', $V, 'all'], ['telecom.broadcasts', $VC, 'all'], ['crm.contacts', $VCE, 'own'], ['crm.deals', $VCE, 'own'], ['inbox', $VE, 'own'],
            ])],
            'marketing' => ['Marketing', 'Campaigns, broadcasts, forms, lead sources and attribution.', false, array_merge($own, [
                ['marketing.campaigns', $ALL, 'all'], ['crm.forms', $VCED, 'all'], ['crm.contacts', $V, 'all'], ['crm.deals', $V, 'all'], ['surveys', $V, 'all'],
            ])],
            'academy_coordinator' => ['Academy Coordinator', 'Students, cohorts, scholarships, attendance and certificates.', false, array_merge($own, [
                ['academy', $VCE, 'unit'], ['academy.certificates', $VCE, 'unit'], ['crm.contacts', $VCE, 'unit'], ['crm.deals', $VCE, 'own'], ['inbox', $VE, 'own'],
            ])],
            'support_agent' => ['Support Agent', 'Inbox and tickets.', false, array_merge($base, [
                ['inbox', $VCE, 'all'], ['support.tickets', $VCE, 'all'], ['crm.contacts', $V, 'all'],
            ])],
            'staff' => ['Staff', 'Own tasks, assigned leads and conversations, attendance, targets and deductions.', false, array_merge($own, [
                ['crm.contacts', $VCE, 'own'], ['crm.deals', $VCE, 'own'], ['inbox', $VE, 'own'], ['support.tickets', $VE, 'own'],
            ])],
            'auditor' => ['Auditor (external)', 'Read-only finance and audit log; access expires on a set date.', true, [
                ['finance.income', $V, 'all'], ['finance.expenses', $V, 'all'], ['finance.invoices', $V, 'all'], ['finance.bills', $V, 'all'], ['finance.reports', $V, 'all'],
                ['finance.bank', $V, 'all'], ['subscriptions', $V, 'all'], ['procurement', $V, 'all'], ['telecom.billing', $V, 'all'], ['audit', $V, 'all'],
            ]],
        ];
    }

    /** Flatten grants; later duplicates widen scope, never narrow. */
    public static function rows(array $grants): array
    {
        $order = array_flip(self::SCOPES);
        $map = [];
        foreach ($grants as [$module, $actions, $scope]) {
            foreach ($actions as $a) {
                $k = "$module:$a";
                if (! isset($map[$k]) || $order[$scope] > $order[$map[$k]['scope']]) {
                    $map[$k] = ['module' => $module, 'action' => $a, 'scope' => $scope];
                }
            }
        }

        return array_values($map);
    }
}
