import { describe, expect, test } from 'bun:test'
import { getBashGateFindings, shouldReviewBashCommand } from './dataLossRules'

const shouldTrigger = (cmd: string) =>
  shouldReviewBashCommand(getBashGateFindings(cmd))

describe('dataLossRules', () => {
  describe('Git operations', () => {
    test('detects git reset --hard', () => {
      expect(shouldTrigger('git reset --hard')).toBe(true)
      expect(shouldTrigger('git reset --hard HEAD~1')).toBe(true)
      expect(shouldTrigger('git reset HEAD~1 --hard')).toBe(true)
    })

    test('does not trigger on git reset without --hard', () => {
      expect(shouldTrigger('git reset HEAD~1')).toBe(false)
      expect(shouldTrigger('git reset --soft HEAD~1')).toBe(false)
    })

    test('detects git clean -fd', () => {
      expect(shouldTrigger('git clean -fd')).toBe(true)
      expect(shouldTrigger('git clean -fdx')).toBe(true)
      expect(shouldTrigger('git clean -f -d')).toBe(true)
    })

    test('does not trigger on git clean without -f', () => {
      expect(shouldTrigger('git clean -n')).toBe(false)
      expect(shouldTrigger('git clean --dry-run')).toBe(false)
    })

    test('detects git push --force', () => {
      expect(shouldTrigger('git push --force')).toBe(true)
      expect(shouldTrigger('git push --force-with-lease')).toBe(true)
      expect(shouldTrigger('git push -f origin main')).toBe(true)
      expect(shouldTrigger('git push origin main --force')).toBe(true)
    })

    test('does not trigger on normal git push', () => {
      expect(shouldTrigger('git push')).toBe(false)
      expect(shouldTrigger('git push origin main')).toBe(false)
    })

    test('detects git stash drop/clear', () => {
      expect(shouldTrigger('git stash drop')).toBe(true)
      expect(shouldTrigger('git stash clear')).toBe(true)
      expect(shouldTrigger('git stash drop stash@{0}')).toBe(true)
    })

    test('does not trigger on git stash save/pop', () => {
      expect(shouldTrigger('git stash')).toBe(false)
      expect(shouldTrigger('git stash pop')).toBe(false)
      expect(shouldTrigger('git stash list')).toBe(false)
    })

    test('detects git reflog expire', () => {
      expect(shouldTrigger('git reflog expire --expire=now --all')).toBe(true)
    })

    test('detects git gc --prune=now', () => {
      expect(shouldTrigger('git gc --prune=now')).toBe(true)
    })
  })

  describe('Filesystem operations', () => {
    test('detects mkfs', () => {
      expect(shouldTrigger('mkfs /dev/sda1')).toBe(true)
      expect(shouldTrigger('mkfs.ext4 /dev/sda1')).toBe(true)
      expect(shouldTrigger('sudo mkfs.xfs /dev/nvme0n1p1')).toBe(true)
    })

    test('detects shred/wipefs/blkdiscard', () => {
      expect(shouldTrigger('shred -vfz /dev/sda')).toBe(true)
      expect(shouldTrigger('wipefs -a /dev/sda')).toBe(true)
      expect(shouldTrigger('blkdiscard /dev/sda')).toBe(true)
    })

    test('detects dd writing to device', () => {
      expect(shouldTrigger('dd if=/dev/zero of=/dev/sda')).toBe(true)
      expect(shouldTrigger('dd if=image.iso of=/dev/sdb bs=4M')).toBe(true)
    })

    test('does not trigger on dd writing to file', () => {
      expect(
        shouldTrigger('dd if=/dev/zero of=./test.img bs=1M count=100'),
      ).toBe(false)
    })

    test('detects rm on critical paths', () => {
      expect(shouldTrigger('rm -rf /')).toBe(true)
      expect(shouldTrigger('rm -rf ~')).toBe(true)
      expect(shouldTrigger('rm -rf .')).toBe(true)
      expect(shouldTrigger('rm -rf ..')).toBe(true)
      expect(shouldTrigger('rm -rf /etc')).toBe(true)
      expect(shouldTrigger('rm -rf /usr')).toBe(true)
      expect(shouldTrigger('rm -rf /bin')).toBe(true)
    })

    test('does not trigger on rm for normal paths', () => {
      expect(shouldTrigger('rm -rf ./node_modules')).toBe(false)
      expect(shouldTrigger('rm -rf /tmp/test')).toBe(false)
      expect(shouldTrigger('rm file.txt')).toBe(false)
      expect(shouldTrigger('rm -rf /var/log/app')).toBe(false)
      expect(shouldTrigger('rm -rf /etc/nginx')).toBe(false)
    })
  })

  describe('Infrastructure operations', () => {
    test('detects terraform destroy', () => {
      expect(shouldTrigger('terraform destroy')).toBe(true)
      expect(shouldTrigger('terraform destroy -auto-approve')).toBe(true)
    })

    test('does not trigger on terraform plan/apply', () => {
      expect(shouldTrigger('terraform plan')).toBe(false)
      expect(shouldTrigger('terraform apply')).toBe(false)
    })

    test('detects kubectl delete', () => {
      expect(shouldTrigger('kubectl delete pod nginx')).toBe(true)
      expect(shouldTrigger('kubectl delete namespace prod')).toBe(true)
    })

    test('does not trigger on kubectl get/describe', () => {
      expect(shouldTrigger('kubectl get pods')).toBe(false)
      expect(shouldTrigger('kubectl describe pod nginx')).toBe(false)
    })

    test('detects pulumi destroy', () => {
      expect(shouldTrigger('pulumi destroy')).toBe(true)
      expect(shouldTrigger('pulumi destroy --yes')).toBe(true)
    })
  })

  describe('False positive prevention', () => {
    test('does not trigger on echo/printf with keywords', () => {
      expect(shouldTrigger('echo "git reset --hard"')).toBe(false)
      expect(shouldTrigger('printf "rm -rf /"')).toBe(false)
    })

    test('does not trigger on comments', () => {
      expect(shouldTrigger('# git reset --hard')).toBe(false)
      expect(shouldTrigger('# rm -rf /')).toBe(false)
    })

    test('does not trigger on grep/cat reading files', () => {
      expect(shouldTrigger('grep "git reset" history.log')).toBe(false)
      expect(shouldTrigger('cat scripts/deploy.sh | grep terraform')).toBe(
        false,
      )
    })
  })

  describe('Complex commands', () => {
    test('detects in piped commands', () => {
      expect(shouldTrigger('ls && git reset --hard')).toBe(true)
      expect(shouldTrigger('cd /tmp && rm -rf /')).toBe(true)
    })

    test('detects in sequential commands', () => {
      expect(shouldTrigger('echo "starting"; git push --force')).toBe(true)
    })
  })

  describe('No false negatives for common patterns', () => {
    test('detects with sudo prefix', () => {
      expect(shouldTrigger('sudo git reset --hard')).toBe(true)
      expect(shouldTrigger('sudo rm -rf /')).toBe(true)
      expect(shouldTrigger('sudo mkfs.ext4 /dev/sda1')).toBe(true)
    })
  })

  describe('getBashGateFindings returns correct findings', () => {
    test('returns finding with code and title', () => {
      const findings = getBashGateFindings('git reset --hard')
      expect(findings.length).toBe(1)
      expect(findings[0]!.code).toBe('GIT_RESET_HARD')
      expect(findings[0]!.severity).toBe('high')
      expect(findings[0]!.title).toContain('uncommitted changes')
    })

    test('returns multiple findings for multiple dangerous ops', () => {
      const findings = getBashGateFindings('git reset --hard && rm -rf /')
      expect(findings.length).toBe(2)
    })

    test('returns empty array for safe commands', () => {
      const findings = getBashGateFindings('ls -la')
      expect(findings.length).toBe(0)
    })
  })
})
