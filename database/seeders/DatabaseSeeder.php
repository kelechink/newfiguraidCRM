<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Production: `php artisan db:seed --class=CoreSeeder`. Demo data: `php artisan db:seed` (adds DemoSeeder). */
    public function run(): void
    {
        $this->call(CoreSeeder::class);
        if (! app()->isProduction()) {
            $this->call(DemoSeeder::class);
        }
    }
}
