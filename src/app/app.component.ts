import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';


import html2canvas from 'html2canvas';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class AppComponent {
  watermarkImage: string | null = null;
  watermarkOpacity: number = 0.3;

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.watermarkImage = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  updateOpacity(event: Event) {
    this.watermarkOpacity = Number((event.target as HTMLInputElement).value);
  }
  items: string[] = [];
  newItem: string = '';
  gridSize: number = 0;
  editingIndex: number = -1;

  editingText: string = '';

  addItem() {
    if (this.newItem.trim()) {
      this.items.push(this.newItem.trim());
      this.newItem = '';
      this.calculateGridSize();
    }
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.calculateGridSize();
  }

  calculateGridSize() {
    this.gridSize = Math.ceil(Math.sqrt(this.items.length));
  }

  startEditing(index: number, item: string) {
    this.editingIndex = index;
    this.editingText = item;
  }

  saveEdit(index: number) {
    if (this.editingText.trim()) {
      this.items[index] = this.editingText.trim();
    }
    this.editingIndex = -1;
    this.editingText = '';
  }

  cancelEdit() {
    this.editingIndex = -1;
    this.editingText = '';
  }

  

  async downloadBingo() {
    const element = document.getElementById('bingo-card');
    if (element) {
      const canvas = await html2canvas(element);
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'bingo-card.png';
      link.href = image;
      link.click();
    }
  }
}
