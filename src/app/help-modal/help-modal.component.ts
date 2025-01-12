import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-help-modal',
  standalone: true,
  template: `
    <div class="modal-overlay" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <button class="close-btn" (click)="close()">×</button>
        <h2>Help Guide</h2>
        <div class="help-content">
          <h3>Basic Functions:</h3>
          <ul>
            <li><strong>Adding Items:</strong> Type text in the input field and click "Add Item" or press Enter.</li>
            <li><strong>Editing Items:</strong> Click on any item to edit its text.</li>
            <li><strong>Removing Items:</strong> Click the × button next to any item to remove it.</li>
          </ul>
          
          <h3>Customization:</h3>
          <ul>
            <li><strong>Font Selection:</strong> Choose from different fonts using the dropdown menu.</li>
            <li><strong>Font Size:</strong> Adjust the text size using the slider (8px to 32px).</li>
            <li><strong>Watermark:</strong> Upload an image to add as a watermark and adjust its opacity.</li>
          </ul>

          <h3>Final Steps:</h3>
          <ul>
            <li><strong>Download:</strong> Click "Download Bingo Card" to save your creation as an image.</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    }

    .close-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      border: none;
      background: none;
      font-size: 24px;
      cursor: pointer;
    }

    .help-content {
      margin-top: 20px;
    }

    h2 {
      margin-top: 0;
      color: #333;
    }

    h3 {
      color: #666;
      margin-top: 15px;
    }

    ul {
      padding-left: 20px;
    }

    li {
      margin-bottom: 8px;
      line-height: 1.4;
    }

    strong {
      color: #444;
    }
  `]
})
export class HelpModalComponent {
  @Output() closeModal = new EventEmitter<void>();

  close() {
    this.closeModal.emit();
  }
}