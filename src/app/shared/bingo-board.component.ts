import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BingoBoardSquare {
  text: string;
  isFree: boolean;
  isEmpty: boolean;
  completed: boolean;
  clickable?: boolean;
  markVariant?: number;
}

@Component({
  selector: 'app-bingo-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bingo-board.component.html',
  styleUrls: ['./bingo-board.component.css'],
})
export class BingoBoardComponent {
  @Input() squares: BingoBoardSquare[] = [];
  @Input() size = 5;
  @Output() cellClick = new EventEmitter<number>();

  get gridCols(): string {
    return `repeat(${this.size}, 1fr)`;
  }

  onCellClick(index: number) {
    if (this.squares[index]?.clickable) {
      this.cellClick.emit(index);
    }
  }
}
