"""Apply a memory budget before executing a native compiler (Linux)."""
import os
import resource
import sys

limit=int(os.environ.get('RELIVE_COMPILER_MEMORY_MB','1536'))*1024*1024
resource.setrlimit(resource.RLIMIT_AS,(limit,limit))
resource.setrlimit(resource.RLIMIT_CPU,(120,120))
os.execv(sys.argv[1],sys.argv[1:])
