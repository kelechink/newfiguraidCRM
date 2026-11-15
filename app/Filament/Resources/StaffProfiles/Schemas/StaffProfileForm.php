<?php

namespace App\Filament\Resources\StaffProfiles\Schemas;

use App\Authz\Access;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\KeyValue;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\TimePicker;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class StaffProfileForm
{
    public static function configure(Schema $schema): Schema
    {
        $pay = fn () => Access::can(auth()->user(), 'hr.salaries', 'view');
        $payEdit = fn () => Access::can(auth()->user(), 'hr.salaries', 'edit');
        $bank = fn () => Access::can(auth()->user(), 'hr.bank_details', 'view');
        $bankEdit = fn () => Access::can(auth()->user(), 'hr.bank_details', 'edit');

        return $schema->columns(2)->components([
            Section::make('Employment')->columns(2)->schema([
                Select::make('user_id')->relationship('user', 'name')->searchable()->preload()->required(),
                TextInput::make('employee_no')->required()->maxLength(12),
                TextInput::make('job_title')->required(),
                Select::make('employment_type')->options(['full_time' => 'Full time', 'part_time' => 'Part time', 'contract' => 'Contract', 'intern' => 'Intern'])->default('full_time')->required(),
                DatePicker::make('start_date')->required(),
                DatePicker::make('probation_ends'),
                TextInput::make('personal_email')->email(),
                TextInput::make('address'),
                KeyValue::make('next_of_kin')->columnSpanFull(),
            ]),
            Section::make('Work schedule & attendance')->columns(2)->schema([
                Select::make('office_id')->relationship('office', 'name')->default(fn () => \App\Models\Office::value('id')),
                CheckboxList::make('working_days')->options([1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'])->default([1, 2, 3, 4, 5])->columns(7)->required(),
                TimePicker::make('resume_time')->seconds(false)->default('09:00')->required(),
                TimePicker::make('close_time')->seconds(false)->default('17:00')->required(),
                TextInput::make('grace_minutes')->numeric()->default(0)->helperText('Company rule: 0 — any time after 09:00 is late.'),
                Toggle::make('remote_allowed')->helperText('Off: punches outside Kano House do not count unless a manager approves them.'),
            ]),
            Section::make('Pay (encrypted)')->visible($pay)->disabled(fn () => ! $payEdit())->columns(2)->schema([
                TextInput::make('salary')->label('Monthly basic (₦)')->numeric()->password()->revealable(),
                Repeater::make('allowances')->schema([TextInput::make('name')->required(), TextInput::make('amount')->numeric()->required()])->columns(2)->columnSpanFull(),
            ]),
            Section::make('Bank & ID (encrypted)')->visible($bank)->disabled(fn () => ! $bankEdit())->columns(2)->schema([
                TextInput::make('bank_name'), TextInput::make('bank_account')->password()->revealable(), TextInput::make('account_name'), TextInput::make('id_number')->label('NIN / ID number')->password()->revealable(),
            ]),
        ]);
    }
}
