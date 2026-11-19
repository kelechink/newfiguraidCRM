<?php

namespace Tests\Feature;

use Database\Seeders\CoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ThemeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CoreSeeder::class);
    }

    public function test_public_pages_carry_the_shared_theme_switch(): void
    {
        foreach (['/', '/terms', '/privacy', '/request', '/privacy/request'] as $url) {
            $res = $this->get($url)->assertOk();
            $res->assertSee('filament:theme:mode', false);   // same storage key as the staff app
            $res->assertSee('data-theme-toggle', false);
            $res->assertSee('logo-horizontal-dark.svg', false);
        }
    }

    public function test_theme_script_runs_under_the_csp_nonce(): void
    {
        $res = $this->get('/')->assertOk();
        preg_match("/'nonce-([^']+)'/", $res->headers->get('Content-Security-Policy'), $m);
        $this->assertNotEmpty($m[1] ?? null);
        $res->assertSee('<script nonce="'.$m[1].'">', false);
    }
}
