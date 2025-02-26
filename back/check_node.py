"""
Node.js Environment Diagnostic Tool

This script checks if Node.js and npm/npx are installed and working correctly.
It helps diagnose issues with running Node.js-based MCP servers.
"""

import os
import sys
import subprocess
import shutil
import platform

def print_section(title):
    print("\n" + "=" * 50)
    print(title)
    print("=" * 50)

def run_command(command, args=None):
    full_command = [command]
    if args:
        full_command.extend(args)
    
    print(f"Running: {' '.join(full_command)}")
    
    try:
        result = subprocess.run(
            full_command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True,
            timeout=10
        )
        
        print(f"Exit code: {result.returncode}")
        
        if result.stdout:
            print("STDOUT:")
            print(result.stdout[:500])  # Limit output to first 500 chars
            
        if result.stderr:
            print("STDERR:")
            print(result.stderr[:500])  # Limit output to first 500 chars
            
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print("ERROR: Command timed out after 10 seconds")
        return False
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

def check_path():
    print_section("PATH Environment Variable")
    path = os.environ.get("PATH", "")
    path_entries = path.split(os.pathsep)
    
    print(f"Number of PATH entries: {len(path_entries)}")
    for i, entry in enumerate(path_entries):
        print(f"{i+1}. {entry}")
        
    return path_entries

def check_node_installation():
    print_section("Node.js Installation")
    
    # Check node
    node_path = shutil.which("node")
    print(f"Node.js path: {node_path}")
    if node_path:
        run_command(node_path, ["--version"])
    else:
        print("Node.js not found in PATH")
    
    # Check npm
    npm_path = shutil.which("npm")
    print(f"npm path: {npm_path}")
    if npm_path:
        run_command(npm_path, ["--version"])
    else:
        print("npm not found in PATH")
    
    # Check npx
    npx_path = shutil.which("npx")
    print(f"npx path: {npx_path}")
    if npx_path:
        run_command(npx_path, ["--version"])
    else:
        print("npx not found in PATH")
    
    return node_path, npm_path, npx_path

def test_npm_exec():
    print_section("Testing npm exec")
    npm_path = shutil.which("npm")
    
    if not npm_path:
        print("npm not found, skipping test")
        return False
    
    print("Testing npm exec command to run basic package")
    success = run_command(npm_path, ["exec", "--yes", "cowsay", "Hello MCP!"])
    
    return success

def test_npx():
    print_section("Testing npx")
    npx_path = shutil.which("npx")
    
    if not npx_path:
        print("npx not found, skipping test")
        return False
    
    print("Testing npx command to run basic package")
    success = run_command(npx_path, ["-y", "cowsay", "Hello MCP!"])
    
    return success

def test_powershell_npm():
    print_section("Testing npm via PowerShell")
    
    if platform.system() != "Windows":
        print("Not running on Windows, skipping PowerShell test")
        return False
    
    print("Testing npm command via PowerShell")
    ps_path = shutil.which("powershell")
    if not ps_path:
        print("PowerShell not found, skipping test")
        return False
    
    success = run_command(ps_path, ["-Command", "npm --version"])
    if success:
        print("Testing npm exec via PowerShell")
        run_command(ps_path, ["-Command", "npm exec --yes cowsay 'Hello MCP!'"])
    
    return success

def main():
    print_section("SYSTEM INFORMATION")
    print(f"OS: {platform.system()} {platform.release()} ({platform.version()})")
    print(f"Python: {sys.version}")
    
    path_entries = check_path()
    node_path, npm_path, npx_path = check_node_installation()
    
    if npm_path:
        test_npm_exec()
    
    if npx_path:
        test_npx()
    
    if platform.system() == "Windows":
        test_powershell_npm()
    
    print_section("RECOMMENDATIONS")
    if not node_path:
        print("- Node.js is not installed or not in PATH. Please install Node.js from https://nodejs.org/")
    elif not npm_path:
        print("- npm is not found. This is unusual as it should be installed with Node.js.")
        print("  Try reinstalling Node.js from https://nodejs.org/")
    elif not npx_path:
        print("- npx is not found. For newer versions of npm, npx should be included.")
        print("  Try updating npm with: npm install -g npm")
    
    print("\nDiagnostic completed!")

if __name__ == "__main__":
    main() 