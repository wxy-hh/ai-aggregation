declare module 'lunar-javascript' {
  export class Solar {
    static fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Solar;
    getLunar(): Lunar;
    getJulianDay(): number;
  }

  export class Lunar {
    getYearInGanZhiExact(): string;
    getMonthInGanZhiExact(): string;
    getDayInGanZhiExact(): string;
    getTimeInGanZhi(): string;
    getJieQi(): JieQi | string;
    getPrevJieQi(): JieQi;
    getNextJieQi(): JieQi;
  }

  export class JieQi {
    getName(): string;
    getSolar(): Solar;
  }
}
