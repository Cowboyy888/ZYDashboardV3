import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildAttendanceReportXlsx } from '@/lib/reports/attendance-report-xlsx';

describe('separate attendance report workbook', () => {
  it('renders only the rows supplied for one location and identifies that location', async () => {
    const buffer = await buildAttendanceReportXlsx(
      [
        {
          employeeCode: 'ZY-0001',
          employeeName: 'Office Employee',
          khmerName: '',
          groupName: 'Office Team',
          jobTitle: 'Assistant',
          status: 'present',
          notes: '',
        },
      ],
      { date: '2026-10-30', shift: 'morning', location: 'office' },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet).toBeDefined();
    if (!sheet) throw new Error('Attendance worksheet was not generated');
    const values: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.text)));
    const text = values.join(' | ');

    expect(sheet.name).toBe('Office Attendance');
    expect(text).toContain('OFFICE ATTENDANCE');
    expect(text).toContain('Office Employee');
    expect(text).not.toContain('Factory Employee');
    expect(text).toContain('Morning 上午');
  });
});
