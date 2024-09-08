import { ApiProperty } from "@nestjs/swagger";
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";
import { Seat } from "../seat/seat.entity";

export enum ItemCategory {
  Monitor = "monitor",
  Arm = "arm",
  Charger = "charger",
}

@Entity("item")
export class Item {
  @ApiProperty({ description: "장비 ID" })
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @ApiProperty({ description: "장비 종류", type: "enum", enum: ItemCategory })
  category: ItemCategory;

  @Column()
  @ApiProperty({ description: "참고 사항" })
  memo?: string;

  @ApiProperty({ description: "장비가 놓인 자리" })
  @ManyToOne(() => Seat, (seat) => seat.items)
  @JoinColumn({ name: "seatId", referencedColumnName: "id" })
  seat?: Relation<Seat>;

  @ApiProperty({ description: "해당 자리 ID" })
  @Column()
  seatId?: number;
}
