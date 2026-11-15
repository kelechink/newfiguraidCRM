<?php

namespace Tests;

use App\Authz\Access;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\CoreSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected bool $seedCore = true;

    protected function setUp(): void
    {
        parent::setUp();
        Access::flush();
    }

    protected function makeUser(string $role, array $attrs = []): User
    {
        $u = User::create(array_merge(['name' => ucfirst($role).' Tester', 'email' => $role.uniqid().'@test.local', 'password' => 'Secret-pass-123', 'status' => 'active', 'role_id' => Role::where('key', $role)->value('id'), 'primary_unit_id' => \App\Models\BusinessUnit::where('code', 'TELECOM')->value('id')], $attrs));
        if ($u->requiresTwoFactor()) {
            $u->forceFill(['app_authentication_secret' => 'JBSWY3DPEHPK3PXP'])->save();
        }

        return $u->fresh();
    }
}
