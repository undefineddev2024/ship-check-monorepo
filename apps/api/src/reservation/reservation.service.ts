import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Reservation } from "./reservation.entity";
import {
  CancelReservationRequest,
  CreateReservationRequest,
  CreateReservationResponse,
  GetJudgementsResponse,
  GetReservationListResponse,
  RetrieveReservationListRequest,
  RetrieveReservationListResponse,
} from "./dto";
import { Between, DataSource, IsNull, MoreThanOrEqual, Not } from "typeorm";
import { Seat } from "../seat/seat.entity";
import {
  AlreadyBookedException,
  SeatAlreadyBookedException,
} from "./exceptions";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class ReservationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  async retrieveReservationList(
    params: RetrieveReservationListRequest
  ): Promise<RetrieveReservationListResponse> {
    const reservationList = await this.dataSource.manager.find(Reservation, {
      where: {
        reservedAt: Between(params.startReservedAt, params.endReservedAt),
        userId: Not(IsNull()),
      },
    });
    return { list: reservationList };
  }

  async getReservationList(reservedAt): Promise<GetReservationListResponse> {
    const reservationList = await this.dataSource.manager.find(Reservation, {
      relations: ["seat", "user", "user.team"],
      where: { reservedAt },
    });

    return { list: reservationList };
  }

  async createReservation(
    payload: CreateReservationRequest,
    userId: number
  ): Promise<CreateReservationResponse> {
    const seat = await this.dataSource.manager.findOne(Seat, {
      where: { id: payload.seatId },
    });

    if (!seat) {
      throw new NotFoundException("좌석이 존재하지않습니다.");
    }

    // 선택한 날짜와 자리에 이미 예약이 되어있는지 확인
    const isSeatAlreadyBooked = await this.dataSource.manager.findOne(
      Reservation,
      {
        where: { seatId: payload.seatId, reservedAt: payload.reservedAt },
      }
    );
    if (isSeatAlreadyBooked) {
      throw new SeatAlreadyBookedException();
    }

    const todayDate = dayjs().tz("Asia/Seoul").format("YYYY-MM-DD");
    if (payload.reservedAt < todayDate) {
      throw new BadRequestException({
        message: "이미 지난날의 예약은 할 수 없습니다",
      });
    }

    // 선택한 날짜에 이미 예약한 유저인지 확인
    const isAlreadyBookedByCurrentUser = await this.dataSource.manager.findOne(
      Reservation,
      {
        where: { userId, reservedAt: payload.reservedAt },
      }
    );

    if (isAlreadyBookedByCurrentUser) {
      throw new AlreadyBookedException();
    }

    const reservation = this.dataSource.manager.create<
      Reservation,
      Partial<Reservation>
    >(Reservation, {
      ...payload,
      userId,
    });

    const reservationResponse = await this.dataSource.manager.save(reservation);

    return new CreateReservationResponse(reservationResponse);
  }

  async cancelReservation(payload: CancelReservationRequest): Promise<void> {
    const reservation = this.dataSource.manager.findOne(Reservation, {
      where: { seatId: payload.seatId, reservedAt: payload.reservedAt },
    });

    const todayDate = dayjs().tz("Asia/Seoul").format("YYYY-MM-DD");
    if (payload.reservedAt < todayDate) {
      throw new BadRequestException({
        message: "이미 지난날의 예약은 취소할 수 없습니다 ;)",
      });
    }

    if (!reservation) {
      throw new NotFoundException("해당 예약이 존재하지 않습니다.");
    }

    await this.dataSource.manager.softDelete(Reservation, {
      seatId: payload.seatId,
      reservedAt: payload.reservedAt,
    });
  }

  async getJudgements(): Promise<GetJudgementsResponse> {
    const now = dayjs().tz("Asia/Seoul");
    const startOfToday = now.startOf("date").toDate();
    const reservedAt = now.format("YYYY-MM-DD");

    const reservationList = await this.dataSource.manager.find(Reservation, {
      relations: ["user"],
      where: {
        reservedAt,
      },
      withDeleted: true,
    });

    // 현재 예약을 유지중인 유저 id를 set으로 저장
    const activeReservationUserIdSet = new Set(
      reservationList
        .filter((reservation) => !reservation.deletedAt)
        .map((reservation) => reservation.userId)
    );

    // 당일 새벽부터 취소하여 현재 예약을 유지하지않고있는 예약 리스트
    const judgementList = reservationList
      .filter(
        (reservation) => !activeReservationUserIdSet.has(reservation.userId)
      )
      .filter(
        (reservation) =>
          (reservation.deletedAt?.getTime() || 0) >= startOfToday.getTime()
      );

    const result: GetJudgementsResponse = {
      userNames: [
        ...new Set(judgementList.map((reservation) => reservation.user.name)),
      ],
    };
    return result;
  }
}
