import { PartialType } from "@nestjs/swagger";
import { CreateHealthMarkerDto } from "./create.health.marker";

export class UpdateHealthMarkerDto extends PartialType(CreateHealthMarkerDto) { }