#include <errno.h>
#include <fcntl.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <unistd.h>

static void die_perror(const char *label) {
  perror(label);
  exit(1);
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s <bpf-file> <program> [args...]\n", argv[0]);
    return 2;
  }

  const char *bpf_path = argv[1];
  int fd = open(bpf_path, O_RDONLY);
  if (fd < 0)
    die_perror("open bpf file");

  struct stat st;
  if (fstat(fd, &st) != 0)
    die_perror("stat bpf file");

  if (st.st_size <= 0) {
    fprintf(stderr, "invalid bpf file size: %ld\n", (long)st.st_size);
    return 1;
  }

  if ((st.st_size % (off_t)sizeof(struct sock_filter)) != 0) {
    fprintf(stderr, "invalid bpf file: size is not a multiple of sock_filter\n");
    return 1;
  }

  size_t filter_count = (size_t)(st.st_size / (off_t)sizeof(struct sock_filter));
  if (filter_count > 65535) {
    fprintf(stderr, "invalid bpf file: too many filters (%zu)\n", filter_count);
    return 1;
  }

  struct sock_filter *filters = malloc((size_t)st.st_size);
  if (!filters)
    die_perror("malloc");

  ssize_t bytes_read = read(fd, filters, (size_t)st.st_size);
  if (bytes_read != st.st_size)
    die_perror("read bpf file");

  close(fd);

  struct sock_fprog prog;
  prog.len = (unsigned short)filter_count;
  prog.filter = filters;

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0)
    die_perror("prctl(PR_SET_NO_NEW_PRIVS)");

  if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog) != 0)
    die_perror("prctl(PR_SET_SECCOMP)");

  execvp(argv[2], &argv[2]);
  die_perror("execvp");
  return 1;
}

