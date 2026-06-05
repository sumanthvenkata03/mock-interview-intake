import { Directive, HostListener, ElementRef, inject } from '@angular/core';

@Directive({
  selector: 'input[appTrim], textarea[appTrim]',
  standalone: true,
})
export class TrimDirective {
  private readonly el = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef);

  @HostListener('blur') onBlur(): void {
    this.trim();
  }
  @HostListener('paste') onPaste(): void {
    setTimeout(() => this.trim()); // let paste land, then trim
  }

  private trim(): void {
    const node = this.el.nativeElement;
    const trimmed = node.value.trim();
    if (trimmed !== node.value) {
      node.value = trimmed;
      node.dispatchEvent(new Event('input', { bubbles: true })); // keep the bound signal in sync
    }
  }
}
