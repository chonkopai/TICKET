import {
  type ArgumentMetadata,
  type PipeTransform,
  type Type,
  ValidationPipe,
} from "@nestjs/common";

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/**
 * tsx does not emit TypeScript's design:paramtypes metadata. Supplying the DTO explicitly keeps
 * development validation identical to the compiled production server.
 */
export class ExplicitDtoPipe implements PipeTransform {
  constructor(private readonly dto: Type<object>) {}

  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    return validation.transform(value, { ...metadata, metatype: this.dto });
  }
}
