import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ProductsRouter } from "./products.router";
import { ProductsService } from "./products.service";

@Module({
	imports: [TrpcModule],
	providers: [ProductsService, ProductsRouter],
})
export class ProductsModule {}
