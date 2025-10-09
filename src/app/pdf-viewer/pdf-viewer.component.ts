import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { PdfViewerModule, PdfViewerComponent as Ng2PdfViewerComponent } from 'ng2-pdf-viewer';

interface TouchInfo {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, PdfViewerModule],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss'
})
export class PdfViewerComponent implements AfterViewInit, OnDestroy {
  pdfSrc: string | any = 'assets/mongodb.pdf';
  page: number = 1;
  totalPages: number = 0;
  zoom: number = 1.0;
  rotation: number = 0;
  isLoading: boolean = true;
  
  // Search state
  searchText: string = '';
  isSearching: boolean = false;
  
  // UI state
  notification: string = '';
  showNotification: boolean = false;
  gestureIndicator: string = '';
  showGestureIndicator: boolean = false;
  isPanMode: boolean = false;
  showTutorial: boolean = false;
  largePageNumber: string = '';
  showLargePageNumber: boolean = false;
  twoFingerIndicatorVisible: boolean = false;
  leftEdgeFlash: boolean = false;
  rightEdgeFlash: boolean = false;

  @ViewChild(Ng2PdfViewerComponent) private pdfComponent!: Ng2PdfViewerComponent;
  @ViewChild('pdfContainer', { static: false }) private pdfContainer!: ElementRef;
  @ViewChild('searchInput', { static: false }) private searchInput!: ElementRef;

  // Gesture configuration
  private config = {
    swipeThreshold: 40,
    swipeTimeLimit: 2000,
    tapMovementThreshold: 25,
    longPressTime: 800,
    minSwipeVelocity: 0.005,
    directionRatio: 1.6,
    zoomInFactor: 1.15,
    zoomOutFactor: 0.87,
    maxZoom: 3.5,
    minZoom: 0.5,
    panModeTimeout: 4000,
    actionDebounceMs: 250
  };

  // Touch/gesture state
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private hasMoved = false;
  private movementDistance = 0;
  private lastActionTime = 0;
  private notificationTimeout: any = null;
  private gestureTimeout: any = null;
  private panModeTimeout: any = null;
  private longPressTimer: any = null;
  private tutorialTimeout: any = null;
  private isPointerDown = false;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private panOffsetX = 0;
  private panOffsetY = 0;
  private hasSeenTutorial = false;

  // Two-finger gesture state
  private activeTouches: { [key: number]: TouchInfo } = {};
  private isTwoFingerGesture = false;
  private twoFingerPanActive = false;
  private twoFingerStartDistance = 0;

  ngAfterViewInit(): void {
    this.setupGestureListeners();
  }

  ngOnDestroy(): void {
    this.clearAllTimers();
    this.removeGestureListeners();
  }

  private setupGestureListeners(): void {
    if (!this.pdfContainer) return;

    const container = this.pdfContainer.nativeElement;

    container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    container.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    container.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive: false });

    container.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    container.addEventListener('pointermove', this.handlePointerMove.bind(this));
    container.addEventListener('pointerup', this.handlePointerUp.bind(this));
    container.addEventListener('pointercancel', this.handlePointerCancel.bind(this));
  }

  private removeGestureListeners(): void {
    if (!this.pdfContainer) return;

    const container = this.pdfContainer.nativeElement;
    container.removeEventListener('touchstart', this.handleTouchStart);
    container.removeEventListener('touchmove', this.handleTouchMove);
    container.removeEventListener('touchend', this.handleTouchEnd);
    container.removeEventListener('touchcancel', this.handleTouchCancel);
    container.removeEventListener('pointerdown', this.handlePointerDown);
    container.removeEventListener('pointermove', this.handlePointerMove);
    container.removeEventListener('pointerup', this.handlePointerUp);
    container.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  private clearAllTimers(): void {
    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    if (this.gestureTimeout) clearTimeout(this.gestureTimeout);
    if (this.panModeTimeout) clearTimeout(this.panModeTimeout);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    if (this.tutorialTimeout) clearTimeout(this.tutorialTimeout);
  }

  // Touch event handlers
  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      this.activeTouches[touch.identifier] = {
        x: touch.clientX,
        y: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY
      };
    }

    if (e.touches.length === 2) {
      this.isTwoFingerGesture = true;
      this.twoFingerPanActive = false;

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      this.twoFingerStartDistance = Math.sqrt(dx * dx + dy * dy);

      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      this.twoFingerIndicatorVisible = true;
    } else if (e.touches.length === 1) {
      this.isTwoFingerGesture = false;
      const touch = e.touches[0];
      this.handleGestureStart(touch.clientX, touch.clientY);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (this.activeTouches[touch.identifier]) {
        this.activeTouches[touch.identifier].x = touch.clientX;
        this.activeTouches[touch.identifier].y = touch.clientY;
      }
    }

    if (e.touches.length === 2 && this.isTwoFingerGesture) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      const distanceChange = Math.abs(currentDistance - this.twoFingerStartDistance);

      if (distanceChange < 30) {
        if (!this.twoFingerPanActive) {
          this.twoFingerPanActive = true;
          this.lastPanX = centerX;
          this.lastPanY = centerY;
        } else {
          const panDeltaX = centerX - this.lastPanX;
          const panDeltaY = centerY - this.lastPanY;
          this.panOffsetX += panDeltaX;
          this.panOffsetY += panDeltaY;
          this.lastPanX = centerX;
          this.lastPanY = centerY;
          this.applyPanTransform();
        }
      }
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleGestureMove(touch.clientX, touch.clientY);
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      delete this.activeTouches[touch.identifier];
    }

    if (this.isTwoFingerGesture && Object.keys(this.activeTouches).length < 2) {
      this.isTwoFingerGesture = false;
      this.twoFingerPanActive = false;
      this.twoFingerIndicatorVisible = false;
      return;
    }

    if (e.changedTouches.length > 0 && !this.isTwoFingerGesture) {
      const touch = e.changedTouches[0];
      this.handleGestureEnd(touch.clientX, touch.clientY);
    }
  }

  private handleTouchCancel(e: TouchEvent): void {
    e.preventDefault();
    this.activeTouches = {};
    this.isTwoFingerGesture = false;
    this.twoFingerPanActive = false;
    this.twoFingerIndicatorVisible = false;
    this.handleGestureCancel();
  }

  // Pointer event handlers
  private handlePointerDown(e: PointerEvent): void {
    this.handleGestureStart(e.clientX, e.clientY);
  }

  private handlePointerMove(e: PointerEvent): void {
    this.handleGestureMove(e.clientX, e.clientY);
  }

  private handlePointerUp(e: PointerEvent): void {
    this.handleGestureEnd(e.clientX, e.clientY);
  }

  private handlePointerCancel(e: PointerEvent): void {
    this.handleGestureCancel();
  }

  // Gesture logic
  private handleGestureStart(x: number, y: number): void {
    this.isPointerDown = true;
    this.touchStartX = x;
    this.touchStartY = y;
    this.touchStartTime = Date.now();
    this.lastPanX = x;
    this.lastPanY = y;
    this.hasMoved = false;
    this.movementDistance = 0;

    if (!this.isPanMode) {
      if (this.longPressTimer) clearTimeout(this.longPressTimer);

      this.longPressTimer = setTimeout(() => {
        if (!this.hasMoved && this.movementDistance < this.config.tapMovementThreshold) {
          this.togglePanMode();
        }
      }, this.config.longPressTime);
    }
  }

  private handleGestureMove(x: number, y: number): void {
    if (!this.isPointerDown) return;

    const deltaX = x - this.touchStartX;
    const deltaY = y - this.touchStartY;
    const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    this.movementDistance = totalMovement;

    if (totalMovement > this.config.tapMovementThreshold) {
      this.hasMoved = true;
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }

    if (this.isPanMode && this.hasMoved) {
      const panDeltaX = x - this.lastPanX;
      const panDeltaY = y - this.lastPanY;
      this.panOffsetX += panDeltaX;
      this.panOffsetY += panDeltaY;
      this.lastPanX = x;
      this.lastPanY = y;
      this.isPanning = true;
      this.applyPanTransform();
      this.resetPanModeTimeout();
    }
  }

  private handleGestureEnd(x: number, y: number): void {
    if (!this.isPointerDown) return;

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    this.isPointerDown = false;
    const touchEndTime = Date.now();
    const deltaX = x - this.touchStartX;
    const deltaY = y - this.touchStartY;
    const deltaTime = touchEndTime - this.touchStartTime;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / Math.max(deltaTime, 1);
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (this.isPanning) {
      this.isPanning = false;
      this.resetPanModeTimeout();
      return;
    }

    if (this.isPanMode && !this.hasMoved && distance < this.config.tapMovementThreshold) {
      this.togglePanMode();
      return;
    }

    if (distance < this.config.swipeThreshold) return;
    if (deltaTime > this.config.swipeTimeLimit) return;
    if (velocity < this.config.minSwipeVelocity) return;

    let direction: string | null = null;
    if (absDeltaX > absDeltaY) {
      if (absDeltaX > absDeltaY * this.config.directionRatio) {
        direction = deltaX > 0 ? 'RIGHT' : 'LEFT';
      }
    } else {
      if (absDeltaY > absDeltaX * this.config.directionRatio) {
        direction = deltaY > 0 ? 'DOWN' : 'UP';
      }
    }

    if (!direction) return;

    switch (direction) {
      case 'LEFT':
        this.flashEdge('right');
        this.nextPage();
        break;
      case 'RIGHT':
        this.flashEdge('left');
        this.prevPage();
        break;
      case 'UP':
        this.zoomIn();
        break;
      case 'DOWN':
        this.zoomOut();
        break;
    }
  }

  private handleGestureCancel(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.isPointerDown = false;
    this.isPanning = false;
  }

  private canPerformAction(): boolean {
    const now = Date.now();
    if (now - this.lastActionTime < this.config.actionDebounceMs) return false;
    this.lastActionTime = now;
    return true;
  }

  private togglePanMode(): void {
    this.isPanMode = !this.isPanMode;

    if (this.isPanMode) {
      this.displayNotification('Pan Mode ON');
      this.resetPanModeTimeout();
    } else {
      this.displayNotification('Swipe Mode ON');
      this.panOffsetX = 0;
      this.panOffsetY = 0;
      this.applyPanTransform();
      if (this.panModeTimeout) {
        clearTimeout(this.panModeTimeout);
        this.panModeTimeout = null;
      }
    }
  }

  private applyPanTransform(): void {
    if (!this.pdfContainer) return;
    
    // Apply transform to the ng2-pdf-viewer-container which holds the actual PDF content
    const container = this.pdfContainer.nativeElement.querySelector('.ng2-pdf-viewer-container');
    if (container) {
      (container as HTMLElement).style.transform = 
        `translate(${this.panOffsetX}px, ${this.panOffsetY}px)`;
      (container as HTMLElement).style.transition = 'none';
    }
  }

  private resetPanModeTimeout(): void {
    if (this.panModeTimeout) clearTimeout(this.panModeTimeout);

    this.panModeTimeout = setTimeout(() => {
      if (this.isPanMode) {
        this.isPanMode = false;
        this.displayNotification('Auto-exit Pan Mode');
      }
    }, this.config.panModeTimeout);
  }

  private flashEdge(edge: string): void {
    if (edge === 'left') {
      this.leftEdgeFlash = true;
      setTimeout(() => this.leftEdgeFlash = false, 200);
    } else {
      this.rightEdgeFlash = true;
      setTimeout(() => this.rightEdgeFlash = false, 200);
    }
  }

  // UI helper methods
  private displayNotification(message: string): void {
    this.notification = message;
    this.showNotification = true;

    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    this.notificationTimeout = setTimeout(() => {
      this.showNotification = false;
    }, 2000);
  }

  private displayGestureIndicator(symbol: string): void {
    this.gestureIndicator = symbol;
    this.showGestureIndicator = true;

    if (this.gestureTimeout) clearTimeout(this.gestureTimeout);
    this.gestureTimeout = setTimeout(() => {
      this.showGestureIndicator = false;
    }, 600);
  }

  private displayLargePageNumber(): void {
    this.largePageNumber = `${this.page}/${this.totalPages}`;
    this.showLargePageNumber = true;

    setTimeout(() => {
      this.showLargePageNumber = false;
    }, 800);
  }

  // Search methods
  focusSearchInput(): void {
    if (this.searchInput && this.searchInput.nativeElement) {
      this.searchInput.nativeElement.focus();
      this.isSearching = true;
    }
  }

  onSearchInputChange(value: string): void {
    this.searchText = value;
  }

  performSearch(): void {
    if (!this.searchText || !this.searchText.trim()) {
      this.displayNotification('Enter search term');
      return;
    }

    this.search(this.searchText.trim());
    this.displayNotification(`Searching: ${this.searchText.trim()}`);
    
    if (this.searchInput && this.searchInput.nativeElement) {
      this.searchInput.nativeElement.blur();
    }
    this.isSearching = false;
  }

  clearSearch(): void {
    this.searchText = '';
    if (this.pdfComponent && this.pdfComponent.eventBus) {
      this.pdfComponent.eventBus.dispatch('find', {
        query: '',
        type: 'again',
        caseSensitive: false,
        findPrevious: undefined,
        highlightAll: false,
        phraseSearch: true
      });
    }
    this.displayNotification('Search cleared');
  }

  onSearchKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.performSearch();
    }
  }

  // PDF control methods
  search(stringToSearch: string): void {
    if (!this.pdfComponent || !this.pdfComponent.eventBus) {
      console.error('PDF component not ready');
      return;
    }

    this.pdfComponent.eventBus.dispatch('find', {
      query: stringToSearch,
      type: 'again',
      caseSensitive: false,
      findPrevious: undefined,
      highlightAll: true,
      phraseSearch: true
    });
  }

  afterLoadComplete(pdf: any): void {
    console.log('PDF loaded successfully!');
    console.log('Total pages:', pdf.numPages);
    this.totalPages = pdf.numPages;
    this.isLoading = false;

    if (!this.hasSeenTutorial) {
      this.tutorialTimeout = setTimeout(() => {
        this.showTutorial = true;
        setTimeout(() => this.hideTutorial(), 4000);
      }, 500);
      this.hasSeenTutorial = true;
    }
  }

  onError(error: any): void {
    console.error('Error loading PDF:', error);
    alert('Error loading PDF. Check console for details.');
    this.isLoading = false;
  }

  nextPage(): void {
    if (!this.canPerformAction()) return;
    this.displayGestureIndicator('▶ NEXT');

    if (this.page >= this.totalPages) {
      this.displayNotification('Last Page');
      return;
    }

    this.page++;
    this.displayLargePageNumber();
  }

  prevPage(): void {
    if (!this.canPerformAction()) return;
    this.displayGestureIndicator('◀ PREV');

    if (this.page <= 1) {
      this.displayNotification('First Page');
      return;
    }

    this.page--;
    this.displayLargePageNumber();
  }

  zoomIn(): void {
    if (!this.canPerformAction()) return;

    const oldZoom = this.zoom;
    this.zoom = Math.min(this.zoom * this.config.zoomInFactor, this.config.maxZoom);

    if (this.zoom === oldZoom) {
      this.displayNotification('Max Zoom');
      return;
    }

    this.displayGestureIndicator('+ ZOOM');
    this.displayNotification(`Zoom ${Math.round(this.zoom * 100)}%`);
  }

  zoomOut(): void {
    if (!this.canPerformAction()) return;

    const oldZoom = this.zoom;
    this.zoom = Math.max(this.zoom * this.config.zoomOutFactor, this.config.minZoom);

    if (this.zoom === oldZoom) {
      this.displayNotification('Min Zoom');
      return;
    }

    this.displayGestureIndicator('− ZOOM');
    this.displayNotification(`Zoom ${Math.round(this.zoom * 100)}%`);
  }

  rotate(): void {
    this.rotation += 90;
    if (this.rotation >= 360) {
      this.rotation = 0;
    }
  }

  hideTutorial(): void {
    this.showTutorial = false;
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