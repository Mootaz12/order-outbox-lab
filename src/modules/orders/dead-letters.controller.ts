import { Controller, Get } from '@nestjs/common';
import { DeadLettersService } from './dead-letters.service';

@Controller('dead-letters')
export class DeadLettersController {
  constructor(private readonly deadLetters: DeadLettersService) {}

  @Get()
  list() {
    return this.deadLetters.list();
  }
}
