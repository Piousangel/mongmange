import { Module } from '@nestjs/common';
import { SavesController } from './saves.controller';

@Module({ controllers: [SavesController] })
export class SavesModule {}
