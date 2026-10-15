export interface IMillisecondClock {
  // 같은 시계 안에서 정수 ms이며, 시간이 거꾸로 흐르지 않습니다.
  readonly elapsedMilliseconds: number;
}