#include <errno.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdio.h>
#include <sys/socket.h>
#include <sys/syscall.h>

#if defined(__x86_64__)
#define KODE_AUDIT_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define KODE_AUDIT_ARCH AUDIT_ARCH_AARCH64
#else
#error "Unsupported architecture for unix-block.bpf generation"
#endif

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <out-bpf-path>\n", argv[0]);
    return 2;
  }

  const char *out_path = argv[1];
  FILE *f = fopen(out_path, "wb");
  if (!f) {
    perror("fopen");
    return 1;
  }

  // The filter intentionally only blocks socket(AF_UNIX, ...).
  // This mirrors the upstream rationale about socketcall() on 32-bit x86.
  struct sock_filter filter[] = {
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, KODE_AUDIT_ARCH, 1, 0),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_socket, 0, 3),
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_UNIX, 0, 1),
      BPF_STMT(BPF_RET | BPF_K,
               SECCOMP_RET_ERRNO | ((unsigned int)EPERM & SECCOMP_RET_DATA)),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };

  if (fwrite(filter, sizeof(filter), 1, f) != 1) {
    perror("fwrite");
    fclose(f);
    return 1;
  }

  if (fclose(f) != 0) {
    perror("fclose");
    return 1;
  }

  return 0;
}

