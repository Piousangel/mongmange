import { Module } from '@nestjs/common';
import { MetricAggregator } from './metric-aggregator';
import { MetricsController } from './metrics.controller';

@Module({ controllers: [MetricsController], providers: [MetricAggregator], exports: [MetricAggregator] })
export class MetricsModule {}
