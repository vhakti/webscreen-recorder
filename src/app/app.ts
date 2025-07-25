import { Component, ViewChild, ElementRef, OnInit,ChangeDetectorRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  @ViewChild('preview') preview!: ElementRef<HTMLVideoElement>;
 private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  isRecording: boolean = false;

 constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}


async startRecording(): Promise<void> {
    try {
      // Request screen capture
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' as 'monitor' },
        audio: true
      });

      // Check if the selected surface is 'monitor' (entire screen)
      const videoTrack = this.stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      const isFirefox = /Firefox/.test(navigator.userAgent);

      let isEntireScreen = false;
      if (isFirefox || !settings.displaySurface) {
        // Workaround for Firefox or browsers without displaySurface
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const trackWidth = settings.width || 0;
        const trackHeight = settings.height || 0;

        // Allow some tolerance (e.g., for scaling or minor differences)
        const widthMatch = Math.abs(trackWidth - screenWidth) <= 100;
        const heightMatch = Math.abs(trackHeight - screenHeight) <= 100;
        isEntireScreen = widthMatch && heightMatch;
        console.log(`Firefox workaround: Track resolution ${trackWidth}x${trackHeight}, Screen resolution ${screenWidth}x${screenHeight}, Is entire screen: ${isEntireScreen}`);
      } else {
        isEntireScreen = settings.displaySurface === 'monitor';
      }

      if (!isEntireScreen) {
        this.stream.getTracks().forEach(track => track.stop());
        this.preview.nativeElement.srcObject = null;
        this.preview.nativeElement.style.display = 'none';
        this.stream = null;
        alert('Por favor, selecciona "Pantalla completa" para grabar. No se permite grabar pestañas o ventanas.');
        this.isRecording = false;
        this.cdr.detectChanges();
        return;
      }
      // Listen for stream termination (browser "Stop Sharing")
      videoTrack.addEventListener('ended', () => {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.handleStopConfirmation(true); // From browser stop sharing
         
        }
      });

      // Show preview
      this.preview.nativeElement.srcObject = this.stream;
      this.preview.nativeElement.style.display = 'block';

      // Select a supported mimeType for MediaRecorder
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      const supportedMimeType = mimeTypes.find(mime => MediaRecorder.isTypeSupported(mime));
      if (!supportedMimeType) {
        throw new Error('No supported video codec found for recording');
      }
      console.log(`Using mimeType: ${supportedMimeType}`);


      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: supportedMimeType });
      this.recordedChunks = [];

      // Collect recorded data
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log(`Chunk received, size: ${event.data.size}, total chunks: ${this.recordedChunks.length}`);
        }
      };

      // Start recording with a timeslice of 1000ms to collect data regularly
      this.mediaRecorder.start(1000);
      this.isRecording = true;
      console.log('Recording started');
      this.cdr.detectChanges(); // Trigger change detection to update button states
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('No se pudo iniciar la grabación: ' + (err as Error).message);
      this.isRecording = false;
      this.cdr.detectChanges();
    }
  }

  async stopRecording(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Create a Promise to wait for data to be collected
      const dataAvailable = new Promise<void>((resolve) => {
        this.mediaRecorder!.onstop = () => {
          console.log(`Recording stopped, total chunks: ${this.recordedChunks.length}`);
          resolve();
        };
      });

      // Stop the recorder
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.cdr.detectChanges(); // Update button states

      // Wait for data to be collected
      await dataAvailable;

      // Check if there are recorded chunks
      if (this.recordedChunks.length === 0) {
        console.error('No recorded data available');
        alert('No se grabó ningún dato. Intenta de nuevo.');
        this.cleanup();
        return;
      }

      // Create Blob from recorded chunks
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      console.log(`Blob created, size: ${blob.size} bytes`);

      // Save the file
      await this.saveFile(blob);

      // Clean up
      this.cleanup();
    }
  }
  private async saveFile(blob: Blob, useFallback: boolean = false): Promise<void> {
    try {
      if (blob.size === 0) {
        throw new Error('El archivo grabado está vacío');
      }

      //este bloque solo sirve para el demo:
      if (!useFallback && 'showSaveFilePicker' in window) {
        // Try using showSaveFilePicker if in user gesture context
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'screen-recording.webm',
          types: [{
            description: 'Video File',
            accept: { 'video/webm': ['.webm'], 'video/mp4': ['.mp4']}
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        console.log('File saved via showSaveFilePicker');
      } else {
       // Fallback: Create a download link
        const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screen-recording.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('File saved via fallback download');
      }
    } catch (err) {
      console.error('Error saving file:', err);
      alert('Error al guardar el archivo: ' + (err as Error).message);
    }
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.preview.nativeElement.srcObject = null;
      this.preview.nativeElement.style.display = 'none';
      this.stream = null;
    }
    this.recordedChunks = [];
    this.mediaRecorder = null;
    this.cdr.detectChanges();
  }

  private async completeStop(useFallback: boolean = false): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Create a Promise to wait for data to be collected
      const dataAvailable = new Promise<void>((resolve) => {
        this.mediaRecorder!.onstop = () => {
          console.log(`Recording stopped, total chunks: ${this.recordedChunks.length}`);
          resolve();
        };
      });

      // Stop the recorder
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.cdr.detectChanges();

      // Wait for data to be collected
      await dataAvailable;

      // Check if there are recorded chunks
      if (this.recordedChunks.length === 0) {
        console.error('No recorded data available');
        alert('No se grabó ningún dato. Intenta de nuevo.');
        this.cleanup();
        return;
      }

      // Create Blob from recorded chunks
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      console.log(`Blob created, size: ${blob.size} bytes`);

      // Save the file
      await this.saveFile(blob, useFallback);
    }

    // Clean up
    this.cleanup();
  }

  private async handleStopConfirmation(fromBrowserStop: boolean): Promise<boolean> {
  const result = window.confirm('¿Estás seguro de detener la grabación? si la detiene la evaluación se dará terminada también.');
  if (result && fromBrowserStop) {
    await this.completeStop(true);
  }else{
         
    console.log('Recording restarted after saving previous recording, because user did not confirm.');
    await this.completeStop(true);
    this.startRecording(); // Restart recording if user did not confirm 
      
  }
 
  return result;
}
}
