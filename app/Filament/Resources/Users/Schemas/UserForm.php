<?php

namespace App\Filament\Resources\Users\Schemas;

use App\Authz\Access;
use App\Models\Role;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Validation\Rules\Password;

class UserForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->columns(2)->components([
            Section::make('Account')->columns(2)->schema([
                TextInput::make('name')->required()->maxLength(120),
                TextInput::make('email')->email()->required()->unique(ignoreRecord: true),
                TextInput::make('phone')->tel(),
                DatePicker::make('birthday'),
                TextInput::make('password')->password()->revealable()->rule(Password::defaults())
                    ->required(fn (string $operation) => $operation === 'create')->dehydrated(fn ($state) => filled($state))
                    ->helperText('Leave blank to keep the current password.'),
                Select::make('status')->options(['invited' => 'Invited', 'onboarding' => 'Onboarding (contract pack first)', 'active' => 'Active', 'suspended' => 'Suspended', 'exited' => 'Exited'])->default('onboarding')->required(),
            ]),
            Section::make('Access')->columns(2)->schema([
                // Only a Super Admin may hand out roles holding sensitive permissions (PRD §3).
                Select::make('role_id')->label('Role')->required()
                    ->options(fn () => Role::query()->when(! auth()->user()?->isRole('super_admin'), fn ($q) => $q->whereNotIn('key', ['super_admin', 'admin', 'finance', 'auditor']))->pluck('name', 'id')),
                Select::make('primary_unit_id')->relationship('primaryUnit', 'name')->required(),
                Select::make('units')->relationship('units', 'name')->multiple()->preload()->label('Also works in'),
                DateTimePicker::make('access_expires_at')->helperText('Required for external auditors.'),
                TagsInput::make('ip_allowlist')->label('Allowed IPs / ranges')->placeholder('e.g. 102.89.0.0/16')->visible(fn () => Access::can(auth()->user(), 'roles', 'edit')),
                TagsInput::make('quiet_hours')->label('Quiet hours (from, to)')->placeholder('22:00'),
            ]),
        ]);
    }
}
