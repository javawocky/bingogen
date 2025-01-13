import { Component } from '@angular/core';
import { HelpModalComponent } from './help-modal/help-modal.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';


import html2canvas from 'html2canvas';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, HelpModalComponent]
})
export class AppComponent {
  showHelp = false;

  toggleHelp() {
    this.showHelp = !this.showHelp;
  }
  watermarkImage: string | null = null;
  watermarkOpacity: number = 0.3;

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.watermarkImage = e.target?.result as string;
        this.saveToLocalStorage();
      };
      reader.readAsDataURL(file);
    }
  }

  updateOpacity(event: Event) {
    this.watermarkOpacity = Number((event.target as HTMLInputElement).value);
    this.saveToLocalStorage();
  }
  items: { text: string; isChecked: boolean }[] = [];
  newItem: string = '';
  gridSize: number = 0;
  editingIndex: number = -1;
  editingText: string = '';

  selectedFont: string = 'Arial';
  fontSize: number = 16;
  availableFonts: string[] = [
    'Arial',
    'Verdana',
    'Times New Roman',
    'Georgia',
    'Courier New',
    'Comic Sans MS'
  ];

  ngOnInit() {
    const savedFont = localStorage.getItem('selectedFont');
    const savedSize = localStorage.getItem('fontSize');
    if (savedFont) {
      this.selectedFont = savedFont;
    }
    if (savedSize) {
      this.fontSize = Number(savedSize);
    }
    // Load items from local storage
    const savedItems = localStorage.getItem('bingoItems');
    if (savedItems) {
      this.items = JSON.parse(savedItems);
      this.calculateGridSize();
    }

    // Load watermark settings from local storage
    const savedWatermark = localStorage.getItem('watermarkImage');
    if (savedWatermark) {
      this.watermarkImage = savedWatermark;
    }
    
    const savedOpacity = localStorage.getItem('watermarkOpacity');
    if (savedOpacity) {
      this.watermarkOpacity = Number(savedOpacity);
    }
  }

  updateFont(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedFont = select.value;
    this.saveToLocalStorage();
  }

  updateFontSize(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fontSize = Number(input.value);
    this.saveToLocalStorage();
  }

  private saveToLocalStorage() {
    localStorage.setItem('selectedFont', this.selectedFont);
    localStorage.setItem('fontSize', this.fontSize.toString());
    localStorage.setItem('bingoItems', JSON.stringify(this.items));
    if (this.watermarkImage) {
      localStorage.setItem('watermarkImage', this.watermarkImage);
    }
    localStorage.setItem('watermarkOpacity', this.watermarkOpacity.toString());
  }

  removeWatermark() {
    this.watermarkImage = null;
    localStorage.removeItem('watermarkImage');
  }

  addItem() {
    if (this.newItem.trim()) {
      this.items.push({ text: this.newItem.trim(), isChecked: false });
      this.newItem = '';
      this.calculateGridSize();
      this.saveToLocalStorage();
    }
  }

  confirmDelete(index: number) {
    if (confirm('Are you sure you want to delete this item?')) {
      this.removeItem(index);
    }
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.calculateGridSize();
    this.saveToLocalStorage();
  }

  calculateGridSize() {
    this.gridSize = Math.ceil(Math.sqrt(this.items.length));
  }

  startEditing(index: number, item: { text: string; isChecked: boolean }) {
    this.editingIndex = index;
    this.editingText = item.text;
  }

  saveEdit(index: number) {
    if (this.editingText.trim()) {
      const isChecked = this.items[index].isChecked;
      this.items[index] = { text: this.editingText.trim(), isChecked };
      this.saveToLocalStorage();
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
