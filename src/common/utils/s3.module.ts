import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';

/**
 * S3Module
 * --------
 * Apr-20 F/u 47 — extracted after the F/u 45 production outage exposed
 * the multi-provider service anti-pattern. Prior state: `S3Service` was
 * declared in `providers: [...]` of 4 separate modules (ChatModule,
 * ProfileModule, OnBoardingModule, WebhooksModule). Nest instantiates
 * each provider per declaring module, so any constructor-dep change on
 * S3Service would have crashed any module that didn't update its imports
 * — exactly the F/u 45 failure mode for UserService.
 *
 * Now: S3Service is provided + exported HERE ONLY. Consumers import
 * this module. Future dep changes propagate automatically via module
 * import resolution.
 *
 * See [[NEVER-DO]] "Never change a service's constructor deps without
 * grepping every module that provides it" and [[Topics/historical-bugs]]
 * pattern #8 (Multi-provider service DI crash).
 */
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
