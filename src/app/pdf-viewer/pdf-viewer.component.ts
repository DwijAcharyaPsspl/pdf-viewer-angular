import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PdfViewerModule } from 'ng2-pdf-viewer';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule, PdfViewerModule],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss'
})
export class PdfViewerComponent {
  pdfSrc: string | any = 'assets/mongodb.pdf';
  page: number = 1;
  totalPages: number = 0;
  zoom: number = 1.0;
  rotation: number = 0;
  isLoading: boolean = true;

  afterLoadComplete(pdf: any): void {
    console.log('PDF loaded successfully!');
    console.log('Total pages:', pdf.numPages);
    this.totalPages = pdf.numPages;
    this.isLoading = false;
  }

  onError(error: any): void {
    console.error('Error loading PDF:', error);
    alert('Error loading PDF. Check console for details.');
    this.isLoading = false;
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
    }
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
    }
  }

  zoomIn(): void {
    this.zoom += 0.1;
  }

  zoomOut(): void {
    if (this.zoom > 0.5) {
      this.zoom -= 0.1;
    }
  }

  rotate(): void {
    this.rotation += 90;
    if (this.rotation >= 360) {
      this.rotation = 0;
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        this.pdfSrc = fileReader.result;
        this.page = 1;
        this.isLoading = true;
      };
      fileReader.readAsArrayBuffer(file);
    }
  }
}
