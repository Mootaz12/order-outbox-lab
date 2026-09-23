import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { StageRetryEntity } from '@modules/stages/entities/stage-retry.entity';
import { OrdersController } from '@modules/orders/controllers/orders.controller';
import { OrdersService } from '@modules/orders/services/orders.service';
import { DeadLettersController } from '@modules/orders/controllers/dead-letters.controller';
import { DeadLettersService } from '@modules/orders/services/dead-letters.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, StageRetryEntity])],
  controllers: [OrdersController, DeadLettersController],
  providers: [OrdersService, DeadLettersService],
})
export class OrdersModule {}
