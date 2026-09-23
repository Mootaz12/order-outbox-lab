import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { StageRetry } from '../stages/stage-retry.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DeadLettersController } from './dead-letters.controller';
import { DeadLettersService } from './dead-letters.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, StageRetry])],
  controllers: [OrdersController, DeadLettersController],
  providers: [OrdersService, DeadLettersService],
})
export class OrdersModule {}
