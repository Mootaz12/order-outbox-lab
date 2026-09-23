import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { StageRetry } from '../entities/stage-retry.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, StageRetry])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
