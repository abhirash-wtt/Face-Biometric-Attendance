import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

describe('AttendanceService - clock-out replacement & duplicate handling', () => {
  let service: AttendanceService;
  let repo: any;
  let employees: any;
  let sites: any;
  let shifts: any;
  let storage: any;
  let config: any;
  let recognition: any;
  let regularization: any;
  let users: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
      create: jest.fn((data) => ({ id: 'log-new', ...data })),
      save: jest.fn(async (data) => data),
    };
    users = { find: jest.fn().mockResolvedValue([]) };
    sites = { assertGpsInside: jest.fn() };
    shifts = { noteForEvent: jest.fn() };
    employees = {
      get: jest.fn().mockResolvedValue({ id: 'emp-1', working_mode: 'office' }),
      listForRoster: jest.fn().mockResolvedValue([]),
      findAll: jest.fn(),
    };
    storage = { put: jest.fn() };
    config = { get: jest.fn().mockReturnValue(60) };
    recognition = { verify: jest.fn() };
    regularization = {
      hasApprovedWfh: jest.fn().mockResolvedValue(false),
      listApprovedPresentEmployeeIds: jest.fn().mockResolvedValue([]),
      listApprovedPresentInRange: jest.fn().mockResolvedValue([]),
    };

    service = new AttendanceService(
      repo,
      users,
      sites,
      shifts,
      employees,
      storage,
      config,
      recognition,
      regularization,
    );
  });

  it('loads roster without enrollment-heavy findAll', async () => {
    employees.listForRoster.mockResolvedValue([
      {
        id: 'emp-1',
        code: 'E1',
        display_name: 'Ada',
        reporting_manager_id: null,
        bu_owner_id: null,
      },
    ]);
    users.find.mockResolvedValue([{ id: 'u1', employee_id: 'emp-1', email: 'ada@ex.com', role: 'employee' }]);
    mockQueryBuilder.getMany.mockResolvedValue([]);

    const result = await service.roster({ date: '2026-03-20' });

    expect(employees.listForRoster).toHaveBeenCalled();
    expect(employees.findAll).not.toHaveBeenCalled();
    expect(users.find).toHaveBeenCalledWith({ select: ['id', 'employee_id', 'email', 'role'] });
    expect(mockQueryBuilder.select).toHaveBeenCalled();
    expect(result.start_date).toBe('2026-03-20');
    expect(result.end_date).toBe('2026-03-20');
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]).toMatchObject({
      employee_id: 'emp-1',
      employee_code: 'E1',
      display_name: 'Ada',
      email: 'ada@ex.com',
      date: '2026-03-20',
      status: 'Absent',
    });
  });

  it('saves first clock-out of the day normally', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null);

    const log = await service.create({
      employee_id: 'emp-1',
      type: 'OUT',
      device_id: 'kiosk-1',
      site_code: 'HQ',
    });

    expect(log).toBeDefined();
    expect(log.type).toBe('OUT');
    expect(repo.save).toHaveBeenCalled();
  });

  it('updates previous clock-out with latest time and throws Duplicate entry detected on subsequent clock-out', async () => {
    const previousOutTime = new Date('2026-03-20T12:30:00+05:30');
    const existingOut = {
      id: 'log-out-1',
      employee_id: 'emp-1',
      type: 'OUT',
      event_time: previousOutTime,
      device_id: 'kiosk-1',
      site_code: 'HQ',
    };
    mockQueryBuilder.getOne.mockResolvedValue(existingOut);

    const before = Date.now();
    let thrown: unknown;
    try {
      await service.create({
        employee_id: 'emp-1',
        type: 'OUT',
        device_id: 'kiosk-2',
        site_code: 'HQ',
      });
    } catch (err) {
      thrown = err;
    }
    const after = Date.now();

    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(repo.save).toHaveBeenCalledWith(existingOut);
    expect(existingOut.event_time.getTime()).toBeGreaterThanOrEqual(before);
    expect(existingOut.event_time.getTime()).toBeLessThanOrEqual(after);
    expect(existingOut.device_id).toBe('kiosk-2');

    const recordedLabel = existingOut.event_time.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    expect(thrown).toEqual(
      new UnprocessableEntityException(`Duplicate entry detected. You clocked out at ${recordedLabel}.`),
    );
  });

  it('rejects duplicate IN on the same day without modifying original clock-in', async () => {
    const twoHoursAgo = new Date('2026-03-20T09:15:00+05:30');
    mockQueryBuilder.getOne.mockResolvedValue({
      id: 'log-in-1',
      employee_id: 'emp-1',
      type: 'IN',
      event_time: twoHoursAgo,
    });

    await expect(
      service.create({
        employee_id: 'emp-1',
        type: 'IN',
      }),
    ).rejects.toThrow(
      new UnprocessableEntityException('Duplicate entry detected. You clocked in at 09:15 AM.'),
    );

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('clocks in automatically when today has no clock-in', async () => {
    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockQueryBuilder.getOne.mockResolvedValue(null);

    const log = await service.recordAutomatic({
      employee_id: 'emp-1',
      type: 'IN',
      device_id: 'kiosk-1',
      site_code: 'HQ',
    });

    expect(log.type).toBe('IN');
    expect(repo.save).toHaveBeenCalled();
  });

  it('clocks out automatically when clock-in is older than the cooldown and clock-out is missing', async () => {
    mockQueryBuilder.getMany.mockResolvedValue([
      {
        id: 'log-in-1',
        employee_id: 'emp-1',
        type: 'IN',
        event_time: new Date(Date.now() - 2 * 60 * 1000),
      },
    ]);
    mockQueryBuilder.getOne.mockResolvedValue(null);

    const log = await service.recordAutomatic({
      employee_id: 'emp-1',
      type: 'IN',
      device_id: 'kiosk-1',
      site_code: 'HQ',
    });

    expect(log.type).toBe('OUT');
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects a repeat scan within one minute without writing a punch', async () => {
    mockQueryBuilder.getMany.mockResolvedValue([
      {
        id: 'log-in-1',
        employee_id: 'emp-1',
        type: 'IN',
        event_time: new Date(),
      },
    ]);

    await expect(
      service.recordAutomatic({
        employee_id: 'emp-1',
        type: 'IN',
      }),
    ).rejects.toThrow(new UnprocessableEntityException('Duplicate entry detected.'));

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not create another punch when clock-in and clock-out already exist', async () => {
    const earlier = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mockQueryBuilder.getMany.mockResolvedValue([
      { id: 'log-in-1', employee_id: 'emp-1', type: 'IN', event_time: earlier },
      {
        id: 'log-out-1',
        employee_id: 'emp-1',
        type: 'OUT',
        event_time: new Date(earlier.getTime() + 60 * 60 * 1000),
      },
    ]);

    await expect(
      service.recordAutomatic({
        employee_id: 'emp-1',
        type: 'IN',
      }),
    ).rejects.toThrow(new UnprocessableEntityException('Attendance already completed for today.'));

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects second IN after IN then OUT on the same day', async () => {
    const existingIn = {
      id: 'log-in-1',
      employee_id: 'emp-1',
      type: 'IN',
      event_time: new Date('2026-03-20T09:15:00+05:30'),
    };
    // Same-day IN exists regardless of a later OUT being the latest punch.
    mockQueryBuilder.getOne.mockResolvedValue(existingIn);

    await expect(
      service.create({
        employee_id: 'emp-1',
        type: 'IN',
        device_id: 'kiosk-1',
        site_code: 'HQ',
      }),
    ).rejects.toThrow(
      new UnprocessableEntityException('Duplicate entry detected. You clocked in at 09:15 AM.'),
    );

    expect(repo.save).not.toHaveBeenCalled();
    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      'a.employee_id = :empId AND a.type = :type AND a.event_time >= :from AND a.event_time <= :to',
      expect.objectContaining({ empId: 'emp-1', type: 'IN' }),
    );
  });

  it('allows first IN of the day when no prior IN exists', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null);

    const log = await service.create({
      employee_id: 'emp-1',
      type: 'IN',
      device_id: 'kiosk-1',
      site_code: 'HQ',
    });

    expect(log).toBeDefined();
    expect(log.type).toBe('IN');
    expect(repo.save).toHaveBeenCalled();
  });
});
