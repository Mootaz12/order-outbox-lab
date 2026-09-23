import { Controller, Get } from '@nestjs/common';
import { DeadLettersService } from '@modules/orders/services/dead-letters.service';

@Controller('dead-letters')
export class DeadLettersController {
  constructor(private readonly deadLetters: DeadLettersService) {}

  /** GET /dead-letters: every dead-lettered `(order, stage)` pair, most retries first. */
  @Get()
  list() {
    return this.deadLetters.list();
  }
}
