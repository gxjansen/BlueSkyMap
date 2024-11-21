import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);

interface PortInfo {
  port: number;
  pid: number;
  timestamp: number;
  type: 'backend' | 'frontend';
}

/**
 * Enhanced utility class to manage port availability in development
 */
export class PortManager {
  private port: number;
  private portInfoFile: string;
  private type: 'backend' | 'frontend';
  private maxRetries: number;
  private portRange: number;

  constructor(
    port: number,
    type: 'backend' | 'frontend' = 'backend',
    maxRetries: number = 10,
    portRange: number = 20
  ) {
    this.port = port;
    this.type = type;
    this.maxRetries = maxRetries;
    this.portRange = portRange;
    this.portInfoFile = path.join(process.cwd(), '.port-info.json');
  }

  /**
   * Kill process using the port forcefully
   */
  private async killProcessOnPort(port: number): Promise<void> {
    try {
      console.log(`[PortManager] Attempting to kill processes on port ${port}`);
      
      // Try multiple methods to kill processes
      const killCommands = [
        `lsof -ti:${port} | xargs kill -9`,
        `kill -9 $(lsof -t -i:${port})`,
        `npx kill-port ${port}`
      ];

      for (const cmd of killCommands) {
        try {
          await execAsync(cmd);
          console.log(`[PortManager] Successfully killed processes on port ${port} using: ${cmd}`);
          return;
        } catch (error) {
          console.warn(`[PortManager] Failed to kill processes with command: ${cmd}`, error);
        }
      }

      // Fallback to platform-specific commands
      const platformCommands = {
        darwin: `sudo killall -9 $(sudo lsof -t -i:${port})`,
        linux: `sudo fuser -k ${port}/tcp`,
        win32: `netstat -ano | findstr :${port} | findstr LISTENING | for /f "tokens=5" %a in ('findstr LISTENING') do taskkill /PID %a /F`
      };

      const platformCmd = platformCommands[process.platform as keyof typeof platformCommands];
      if (platformCmd) {
        try {
          await execAsync(platformCmd);
          console.log(`[PortManager] Successfully killed processes on port ${port} using platform-specific command`);
        } catch (error) {
          console.warn(`[PortManager] Failed to kill processes with platform command`, error);
        }
      }
    } catch (error) {
      console.error(`[PortManager] Error finding/killing processes on port ${port}:`, error);
    }
  }

  /**
   * Ensure port is available by trying multiple strategies
   */
  public async ensurePortAvailable(): Promise<number> {
    if (process.env.NODE_ENV !== 'development') {
      console.log('[PortManager] Port management only runs in development mode');
      return this.port;
    }

    // Aggressive port killing
    await this.killProcessOnPort(this.port);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Check if port is in use
        const cmd = process.platform === 'win32'
          ? `netstat -ano | findstr :${this.port}`
          : `lsof -i :${this.port}`;

        try {
          await execAsync(cmd);
          // If command succeeds, port is in use
          console.log(`[PortManager] Port ${this.port} is in use, trying alternative`);
          
          // Try next port in range
          const newPort = this.port + attempt + 1;
          await this.killProcessOnPort(newPort);
          
          console.log(`[PortManager] Attempting to use port ${newPort}`);
          return newPort;
        } catch {
          // If command fails, port is available
          console.log(`[PortManager] Port ${this.port} is available`);
          return this.port;
        }
      } catch (error) {
        console.error(`[PortManager] Attempt ${attempt + 1} failed:`, error);
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`[PortManager] Failed to find an available port after ${this.maxRetries} attempts`);
  }

  /**
   * Release port on process exit
   */
  public async releasePort(): Promise<void> {
    console.log(`[PortManager] Releasing port ${this.port}`);
    await this.killProcessOnPort(this.port);
  }
}
