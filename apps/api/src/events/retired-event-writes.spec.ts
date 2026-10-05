import { BadRequestException, GoneException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EventsController } from "./events.controller.js";
import { assertCurrentResourceWrite, rejectHallDepositInput } from "./current-sale-policy.js";
import { CreateTicketTypeDto, UpdateTicketTypeDto } from "../ticket-types/ticket-types.dto.js";
import { CreateTableDto, UpdateTableDto } from "../tables/tables.dto.js";
import { CreateVenueRowDto, UpdateVenueRowDto, CreateTableSeatsDto } from "../seats/seats.dto.js";
import { TicketCheckoutDto, TableCheckoutDto, CartCheckoutDto, SeatCheckoutDto } from "../booking/booking.dto.js";
const pipe = new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
describe("retired creation and deposit writes", () => {
  it("returns explicit 410 tombstones without accessing a writer", () => {
    const inaccessible = new Proxy({}, {get:()=>{throw new Error("Retired writer accessed");}});
    const controller = new EventsController(inaccessible as never,inaccessible as never);
    for(const invoke of [()=>controller.retiredCreate(),()=>controller.retiredEdit(),()=>controller.retiredPublish(),()=>controller.retiredPosterUpload(),()=>controller.retiredPosterDelete(),()=>controller.retiredTranslationSave(),()=>controller.retiredTranslation()]) {
      expect(invoke).toThrow(GoneException);
      try {invoke();} catch(error) {expect((error as GoneException).getResponse()).toMatchObject({code:"EVENT_CREATION_V2_REQUIRED"});}
    }
  });
  it("rejects deposit fields on every current resource and checkout DTO, including zero", async () => {
    for(const metatype of [CreateTicketTypeDto,UpdateTicketTypeDto,CreateTableDto,UpdateTableDto,CreateVenueRowDto,UpdateVenueRowDto,CreateTableSeatsDto,TicketCheckoutDto,TableCheckoutDto,CartCheckoutDto,SeatCheckoutDto]) {
      for(const deposit of [0,100]) {
        await expect(pipe.transform({deposit},{type:"body",metatype})).rejects.toBeInstanceOf(BadRequestException);
      }
    }
    for(const value of [{editor:{objects:[{deposit:0}]}},{tables:[{deposit:100}]},{rows:[{deposit:0}]},{deposit:0}]) expect(()=>rejectHallDepositInput(value)).toThrow(BadRequestException);
  });
  it("locks normalized resources to the revisioned editor and legacy deposits to review", () => {
    expect(()=>assertCurrentResourceWrite({paymentMode:"full_payment",creationVersion:2})).toThrow("revisioned");
    expect(()=>assertCurrentResourceWrite({paymentMode:"deposit"})).toThrow("New deposit sales are closed");
  });
});
