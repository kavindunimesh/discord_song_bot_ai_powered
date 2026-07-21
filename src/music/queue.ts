import type { Track } from './track';

export class TrackQueue {
  private tracks: Track[] = [];

  get size(): number {
    return this.tracks.length;
  }

  get list(): Track[] {
    return [...this.tracks];
  }

  enqueue(track: Track): number {
    this.tracks.push(track);
    return this.tracks.length;
  }

  dequeue(): Track | undefined {
    return this.tracks.shift();
  }

  clear(): void {
    this.tracks = [];
  }
}
