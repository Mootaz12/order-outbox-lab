import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { env } from './common/env';
import { Order } from './entities/order.entity';
import { OrderStageEvent } from './entities/order-stage-event.entity';
import { Outbox } from './entities/outbox.entity';
import { StageRetry } from './entities/stage-retry.entity';
import { HealthModule } from './health/health.module';
import { OrderEventsModule } from './order-events/order-events.module';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { RedisModule } from './redis/redis.module';
import { EmailModule } from './stages/email/email.module';
import { InventoryModule } from './stages/inventory/inventory.module';
import { PaymentModule } from './stages/payment/payment.module';
import { OrderStatusModule } from './status/order-status.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: env.databaseUrl,
      entities: [Order, Outbox, OrderStageEvent, StageRetry],
      // Schema comes from migrations, applied by the one-shot `migrator` service that
      // the app instances wait on. Three instances inferring schema at boot would
      // race each other to CREATE TABLE the same objects.
      synchronize: false,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({ rootPath: join(process.cwd(), 'public') }),
    RedisModule,
    OrdersModule,
    OutboxModule,
    PaymentModule,
    InventoryModule,
    EmailModule,
    OrderEventsModule,
    OrderStatusModule,
    HealthModule,
  ],
})
export class AppModule {}
