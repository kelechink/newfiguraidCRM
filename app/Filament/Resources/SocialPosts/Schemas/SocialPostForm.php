<?php

namespace App\Filament\Resources\SocialPosts\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class SocialPostForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->columns(2)->components([
            Select::make('unit_id')->relationship('unit', 'name')->default(fn () => auth()->user()->primary_unit_id)->required(),
            Select::make('platform')->options(['facebook' => 'Facebook (auto-publish)', 'instagram' => 'Instagram (auto-publish, needs image)', 'linkedin' => 'LinkedIn (copy & post)', 'x' => 'X (copy & post)'])->required(),
            Textarea::make('body')->rows(8)->required()->maxLength(2200)->columnSpanFull(),
            TextInput::make('image_url')->label('Public image URL')->url()->columnSpanFull(),
            DateTimePicker::make('scheduled_at')->label('Publish at (blank = when approved)'),
        ]);
    }
}
