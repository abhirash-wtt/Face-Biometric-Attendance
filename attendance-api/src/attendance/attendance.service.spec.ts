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
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
      create: jest.fn((data) => ({ id: 'log-new', ...data })),
      save: jest.fn(async (data) => data),
    };
    users = { find: jest.fn() };
    sites = { assertGpsInside: jest.fn() };
    shifts = { noteForEvent: jest.fn() };
    employees = { get: jest.fn().mockResolvedValue({ id: 'emp-1', working_mode: 'office' }) };
    storage = { put: jest.fn() };
    config = { get: jest.fn().mockReturnValue(60) };
    recognition = { verify: jest.fn() };
    regularization = { hasApprovedWfh: jest.fn().mockResolvedValue(false) };

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
    const previousOutTime = new Date(Date.now() - 4 * 3600 * 1000); // 4 hours ago (e.g. early accidental clock out)
    const existingOut = {
      id: 'log-out-1',
      employee_id: 'emp-1',
      type: 'OUT',
      event_time: previousOutTime,
      device_id: 'kiosk-1',
      site_code: 'HQ',
    };
    mockQueryBuilder.getOne.mockResolvedValue(existingOut);

    await expect(
      service.create({
        employee_id: 'emp-1',
        type: 'OUT',
        device_id: 'kiosk-2',
        site_code: 'HQ',
      }),
    ).rejects.toThrow(new UnprocessableEntityException('Duplicate entry detected.'));

    // Verify existing record was updated with new event_time and saved
    expect(repo.save).toHaveBeenCalledWith(existingOut);
    expect(existingOut.event_time.getTime()).toBeGreaterThan(previousOutTime.getTime());
    expect(existingOut.device_id).toBe('kiosk-2');
  });

  it('rejects duplicate IN on the same day without modifying original clock-in', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    repo.findOne.mockResolvedValue({
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
    ).rejects.toThrow(new UnprocessableEntityException('Duplicate entry detected.'));

    expect(repo.save).not.toHaveBeenCalled();
  });
});
