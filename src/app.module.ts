import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { configNamespaces } from "@config";
import { DatabaseModule } from "@infrastructure/database/database.module";
import { EventBusModule } from "@infrastructure/event-bus/event-bus.module";
import { HealthModule } from "@modules/health/health.module";
import { OrdersModule } from "@modules/orders/orders.module";
import { OutboxModule } from "@modules/outbox/outbox.module";
import { StageEventsModule } from "@modules/stage-events/stage-events.module";
import { StagesModule } from "@modules/stages/stages.module";
import { OrderStatusModule } from "@modules/status/order-status.module";

/** Composition root: config, then infrastructure, then the features in pipeline order. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: configNamespaces }),
    DatabaseModule,
    EventBusModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({ rootPath: join(process.cwd(), "public") }),
    OrdersModule,
    OutboxModule,
    StagesModule,
    StageEventsModule,
    OrderStatusModule,
    HealthModule,
  ],
})
export class AppModule {}
