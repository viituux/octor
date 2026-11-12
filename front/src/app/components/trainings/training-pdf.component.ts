import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TrainingService, InstitutionalProfile, trainingError } from '../../services/training.service';
import { OctorLogoComponent } from '../shared/octor-logo.component';

interface InstitutionalDocument {
  title: string;
  description?: string;
  document_profile?: InstitutionalProfile;
  steps: {id: number; text: string; screenshot_url?: string | null}[];
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, OctorLogoComponent],
  templateUrl: './training-pdf.component.html',
  styleUrls: ['./training-pdf.component.css'],
})
export class TrainingPdfComponent implements OnInit, OnDestroy {
  id = 0;
  loading = true;
  printing = false;
  error = '';
  warnings: string[] = [];
  document: InstitutionalDocument | null = null;
  revision: {label: string; published_at: string} | null = null;
  history: {label: string; published_at: string; release_notes: string}[] = [];
  private urls: string[] = [];
  private destroyed = false;

  constructor(private route: ActivatedRoute, private trainings: TrainingService, private host: ElementRef<HTMLElement>) {}

  async ngOnInit() {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    const version = Number(this.route.snapshot.paramMap.get('version'));
    try {
      const snapshot = await firstValueFrom(this.trainings.versionDetail(this.id, version));
      const prepared = await this.trainings.hydrateContent(snapshot.content, ['screenshot_url']);
      if (this.destroyed) {
        prepared.urls.forEach(url => URL.revokeObjectURL(url));
        return;
      }
      this.urls = prepared.urls;
      this.warnings = prepared.warnings;
      this.revision = snapshot.version;
      this.history = snapshot.history || [];
      this.document = prepared.content;
    } catch (error) {
      this.error = trainingError(error);
    } finally {
      this.loading = false;
    }
  }

  async print() {
    if (this.printing || !this.document) return;
    this.printing = true;
    try {
      const figures = Array.from(this.host.nativeElement.querySelectorAll<HTMLImageElement>('figure img'));
      await Promise.allSettled(figures.map(image => image.decode()));
      if (!this.destroyed) window.print();
    } finally {
      this.printing = false;
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.urls.forEach(url => URL.revokeObjectURL(url));
  }
}
