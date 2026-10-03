import pathlib
import sys
import tarfile


def validate_archive(archive_path):
    with tarfile.open(archive_path, 'r:gz') as archive:
        count = 0
        for member in archive:
            path = pathlib.PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or any(ord(char) < 32 for char in member.name):
                raise ValueError('Archive contains an unsafe path')
            if not (member.isfile() or member.isdir()):
                raise ValueError('Archive contains a link or special filesystem entry')
            count += 1
        if not count:
            raise ValueError('Archive is empty')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Archive path required')
        validate_archive(sys.argv[1])
    except (ValueError, tarfile.TarError, OSError):
        sys.stderr.write('Deployment archive validation failed.\n')
        sys.exit(1)
