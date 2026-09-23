import { Controller, Get, Query } from '@nestjs/common';
import { ListDeadLettersQueryDto } from '@modules/orders/dtos/list-dead-letters-query.dto';
import { DeadLettersService } from '@modules/orders/services/dead-letters.service';

@Controller('dead-letters')
export class DeadLettersController {
  constructor(private readonly deadLetters: DeadLettersService) {}

  /** GET /dead-letters?limit=&order=&stage=: validated by ListDeadLettersQueryDto. */
  @Get()
  list(@Query() query: ListDeadLettersQueryDto) {
    return this.deadLetters.list(query);
  }
}
