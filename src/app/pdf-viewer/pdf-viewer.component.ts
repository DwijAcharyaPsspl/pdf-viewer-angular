import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { PdfViewerModule, PdfViewerComponent as Ng2PdfViewerComponent } from 'ng2-pdf-viewer';

interface TouchInfo {
  x: number;
  y: number;
  startX: number;
  startY: number;
  time: number;
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
  zoom: number = 2.0;
  rotation: number = 0;
  isLoading: boolean = true;
  
  // Search state
  searchText: string = '';
  isSearching: boolean = false;
  hasSearchResults: boolean = false;
  currentMatchIndex: number = 0;
  totalMatches: number = 0;
  
  // Store listener references for cleanup
  private findControllerListener: any = null;
  private matchesCountListener: any = null;
  
  // UI state
  notification: string = '';
  showNotification: boolean = false;
  gestureIndicator: string = '';
  showGestureIndicator: boolean = false;
  isPanMode: boolean = false;
  showTutorial: boolean = false;
  largePageNumber: string = '';
  showLargePageNumber: boolean = false;
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
    actionDebounceMs: 250,
    doubleTapMaxDelay: 800,
    doubleTapMaxDistance: 125
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
  private activeTouches: Map<number, TouchInfo> = new Map();

  // Double tap for search
  private lastTapTime: number = 0;
  private lastTapX: number = 0;
  private lastTapY: number = 0;
  
  // Auto-search debounce
  private searchDebounceTimeout: any = null;
  private readonly SEARCH_DEBOUNCE_DELAY = 1500;

  ngAfterViewInit(): void {
    this.setupGestureListeners();
  }

  ngOnDestroy(): void {
    this.clearAllTimers();
    this.removeGestureListeners();
    this.removeSearchListeners();
  }

  private removeSearchListeners(): void {
    if (this.pdfComponent && this.pdfComponent.eventBus) {
      if (this.findControllerListener) {
        this.pdfComponent.eventBus.off('updatefindcontrolstate', this.findControllerListener);
      }
      if (this.matchesCountListener) {
        this.pdfComponent.eventBus.off('updatefindmatchescount', this.matchesCountListener);
      }
    }
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
    if (this.searchDebounceTimeout) clearTimeout(this.searchDebounceTimeout);
  }

  // Touch event handlers
  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();

    const now = Date.now();

    // Add all new touches
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      this.activeTouches.set(touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY,
        time: now
      });
    }

    // Handle single finger gestures
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleGestureStart(touch.clientX, touch.clientY);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    // Update positions
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const stored = this.activeTouches.get(touch.identifier);
      if (stored) {
        stored.x = touch.clientX;
        stored.y = touch.clientY;
      }
    }

    // Handle single finger movement
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleGestureMove(touch.clientX, touch.clientY);
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();

    // Remove ended touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.activeTouches.delete(touch.identifier);
    }

    // Handle single finger gesture end
    if (e.changedTouches.length > 0 && e.touches.length === 0) {
      const touch = e.changedTouches[0];
      this.handleGestureEnd(touch.clientX, touch.clientY);
    }
  }

  private handleTouchCancel(e: TouchEvent): void {
    e.preventDefault();
    this.activeTouches.clear();
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

    // Check for tap (potential double tap)
    if (!this.hasMoved && distance < this.config.tapMovementThreshold && deltaTime < 500) {
      this.handleTap(x, y, touchEndTime);
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

  private handleTap(x: number, y: number, time: number): void {
    const timeSinceLastTap = time - this.lastTapTime;
    const distanceFromLastTap = Math.sqrt(
      Math.pow(x - this.lastTapX, 2) + Math.pow(y - this.lastTapY, 2)
    );

    // Check if this is a double tap
    if (timeSinceLastTap < this.config.doubleTapMaxDelay && 
        distanceFromLastTap < this.config.doubleTapMaxDistance) {
      // Double tap detected!
      console.log('Double tap detected!');
      this.openSearch();
      // Reset to prevent triple tap
      this.lastTapTime = 0;
      this.lastTapX = 0;
      this.lastTapY = 0;
    } else {
      // First tap, record it
      this.lastTapTime = time;
      this.lastTapX = x;
      this.lastTapY = y;
    }
  }

  private openSearch(): void {
    this.displayNotification('Search Mode - Double tap detected!');
    this.displayGestureIndicator('🔍 SEARCH');
    this.focusSearchInput();
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
        this.panOffsetX = 0;
        this.panOffsetY = 0;
        this.applyPanTransform()
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
    
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
    }
    
    if (!value || !value.trim()) {
      this.clearSearch();
      return;
    }
    
    this.searchDebounceTimeout = setTimeout(() => {
      this.performAutoSearch();
    }, this.SEARCH_DEBOUNCE_DELAY);
  }

  performAutoSearch(): void {
    if (!this.searchText || !this.searchText.trim()) {
      return;
    }

    this.search(this.searchText.trim());
  }

  performSearch(): void {
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
    }
    
    if (!this.searchText || !this.searchText.trim()) {
      this.displayNotification('Enter search term');
      return;
    }

    this.search(this.searchText.trim());
    
    if (this.searchInput && this.searchInput.nativeElement) {
      this.searchInput.nativeElement.blur();
    }
    this.isSearching = false;
  }

  findNext(): void {
    if (!this.hasSearchResults || !this.pdfComponent || !this.pdfComponent.eventBus) {
      this.displayNotification('No search results');
      return;
    }

    console.log('Finding next match...');
    
    // Don't show "No matches" notification during navigation
    this.pdfComponent.eventBus.dispatch('find', {
      query: this.searchText,
      type: 'again',
      caseSensitive: false,
      findPrevious: false,
      highlightAll: true,
      phraseSearch: true
    });
    
    // Small delay to let the match counter update
    setTimeout(() => {
      if (this.hasSearchResults) {
        this.displayNotification(`Match ${this.currentMatchIndex}/${this.totalMatches}`);
      }
    }, 100);
  }

  findPrevious(): void {
    if (!this.hasSearchResults || !this.pdfComponent || !this.pdfComponent.eventBus) {
      this.displayNotification('No search results');
      return;
    }

    console.log('Finding previous match...');
    
    // Don't show "No matches" notification during navigation
    this.pdfComponent.eventBus.dispatch('find', {
      query: this.searchText,
      type: 'again',
      caseSensitive: false,
      findPrevious: true,
      highlightAll: true,
      phraseSearch: true
    });
    
    // Small delay to let the match counter update
    setTimeout(() => {
      if (this.hasSearchResults) {
        this.displayNotification(`Match ${this.currentMatchIndex}/${this.totalMatches}`);
      }
    }, 100);
  }

  clearSearch(): void {
    this.searchText = '';
    this.hasSearchResults = false;
    this.currentMatchIndex = 0;
    this.totalMatches = 0;
    
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
    }
    
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
      if (this.searchDebounceTimeout) {
        clearTimeout(this.searchDebounceTimeout);
      }
      this.performSearch();
    }
  }

  // PDF control methods
  search(stringToSearch: string): void {
    if (!this.pdfComponent || !this.pdfComponent.eventBus) {
      console.error('PDF component not ready');
      return;
    }

    console.log('Starting search for:', stringToSearch);

    // Remove old listeners if they exist
    if (this.findControllerListener) {
      this.pdfComponent.eventBus.off('updatefindcontrolstate', this.findControllerListener);
    }
    if (this.matchesCountListener) {
      this.pdfComponent.eventBus.off('updatefindmatchescount', this.matchesCountListener);
    }

    // Create and store match count listener
    this.matchesCountListener = (event: any) => {
      console.log('Match count update:', event);
      if (event.matchesCount) {
        this.totalMatches = event.matchesCount.total || 0;
        this.currentMatchIndex = event.matchesCount.current || 0;
        this.hasSearchResults = this.totalMatches > 0;
        
        if (this.hasSearchResults) {
          console.log(`Search results: ${this.currentMatchIndex}/${this.totalMatches}`);
          this.displayNotification(`Match ${this.currentMatchIndex}/${this.totalMatches}`);
        }
      }
    };

    // Create and store find controller listener
    this.findControllerListener = (event: any) => {
      console.log('Find controller state:', event);
      
      if (event.state === 3) {
        // Not found - only show if we're doing initial search, not navigation
        if (!this.hasSearchResults) {
          this.hasSearchResults = false;
          this.totalMatches = 0;
          this.currentMatchIndex = 0;
          this.displayNotification('No matches found');
        }
        return;
      }
      
      // Navigate to the page with the match
      if (event.state === 0 || event.state === 1 || event.state === 2) {
        let foundPage = null;
        
        if (event.pageIdx !== undefined && event.pageIdx !== null) {
          foundPage = event.pageIdx + 1;
        } else if (event.source && event.source.selected && event.source.selected.pageIdx !== undefined) {
          foundPage = event.source.selected.pageIdx + 1;
        }
        
        if (foundPage && foundPage !== this.page) {
          console.log('Navigating to page:', foundPage);
          this.page = foundPage;
          this.displayLargePageNumber();
        }
        
        // Update match info if available
        if (event.matchesCount) {
          this.totalMatches = event.matchesCount.total || 0;
          this.currentMatchIndex = event.matchesCount.current || 0;
          this.hasSearchResults = this.totalMatches > 0;
        }
      }
    };

    // Add new listeners
    this.pdfComponent.eventBus.on('updatefindmatchescount', this.matchesCountListener);
    this.pdfComponent.eventBus.on('updatefindcontrolstate', this.findControllerListener);

    // Dispatch find command - this searches the ENTIRE PDF
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